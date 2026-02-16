import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { lead_id, tier } = await req.json();

    console.log(`[updateSheetTierStatus] Received request - lead_id: ${lead_id}, tier: ${tier}`);

    if (!lead_id || !tier) {
      return Response.json({ error: 'lead_id and tier are required' }, { status: 400 });
    }

    // Get access token for Google Sheets
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googlesheets');
    const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');

    if (!spreadsheetId) {
      return Response.json({ error: 'GOOGLE_SHEET_ID not configured' }, { status: 500 });
    }

    // Parse lead_id to get lead type and row index
    // Format: leadType_rowIndex (e.g., "life_0", "auto_5")
    const parts = lead_id.split('_');
    const leadType = parts.slice(0, -1).join('_'); // Handle multi-word types like "final_expense"
    const rowIndex = parseInt(parts[parts.length - 1]);
    const rowNumber = rowIndex + 2; // +1 for header row, +1 for 0-based index
    
    console.log(`[updateSheetTierStatus] Parsed - leadType: ${leadType}, rowIndex: ${rowIndex}, rowNumber: ${rowNumber}`);

    // Map lead types to sheet IDs
    const sheetIds = {
      auto: '44023422',
      home: '1745292620',
      health: '1305861843',
      life: '113648240',
      medicare: '757044649',
      final_expense: '387991684',
      veteran_life: '1401332567',
      retirement: '712013125'
    };

    const sheetId = sheetIds[leadType];
    if (!sheetId) {
      return Response.json({ error: 'Invalid lead type' }, { status: 400 });
    }

    // Get sheet name from metadata
    const sheetMetaResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!sheetMetaResponse.ok) {
      const errorText = await sheetMetaResponse.text();
      console.error(`[updateSheetTierStatus] Failed to fetch sheet metadata:`, errorText);
      return Response.json({ error: 'Failed to fetch sheet metadata', details: errorText }, { status: 500 });
    }

    const sheetMeta = await sheetMetaResponse.json();
    const sheetMap = {};
    sheetMeta.sheets?.forEach(sheet => {
      const id = sheet.properties.sheetId.toString();
      sheetMap[id] = sheet.properties.title;
    });

    const sheetName = sheetMap[sheetId];
    if (!sheetName) {
      console.error(`[updateSheetTierStatus] Sheet not found for sheetId: ${sheetId}`);
      return Response.json({ error: 'Sheet not found' }, { status: 404 });
    }
    
    console.log(`[updateSheetTierStatus] Sheet name: ${sheetName}`);

    // Map tier to column index (tier_1 = column O = 15, tier_2 = column P = 16, etc.)
    const tierColumnIndices = {
      tier1: 15, // Column O
      tier2: 16, // Column P
      tier3: 17, // Column Q
      tier4: 18, // Column R
      tier5: 19  // Column S
    };

    const columnIndex = tierColumnIndices[tier];
    if (!columnIndex) {
      return Response.json({ error: 'Invalid tier' }, { status: 400 });
    }

    // Check if sheet has enough columns, if not, add them
    const sheetProperties = sheetMeta.sheets?.find(s => s.properties.sheetId.toString() === sheetId);
    const currentColumnCount = sheetProperties?.properties?.gridProperties?.columnCount || 0;
    
    console.log(`[updateSheetTierStatus] Current columns: ${currentColumnCount}, needed: ${columnIndex + 1}`);

    if (currentColumnCount < columnIndex + 1) {
      console.log(`[updateSheetTierStatus] Adding columns to sheet...`);
      
      const addColumnsResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            requests: [{
              appendDimension: {
                sheetId: parseInt(sheetId),
                dimension: 'COLUMNS',
                length: (columnIndex + 1) - currentColumnCount
              }
            }]
          })
        }
      );

      if (!addColumnsResponse.ok) {
        const errorText = await addColumnsResponse.text();
        console.error(`[updateSheetTierStatus] Failed to add columns:`, errorText);
      } else {
        console.log(`[updateSheetTierStatus] Successfully added columns`);
      }
    }

    // Convert column index to letter
    const columnLetter = String.fromCharCode(65 + columnIndex - 1);
    
    // Update the cell
    const range = `'${sheetName}'!${columnLetter}${rowNumber}`;
    console.log(`[updateSheetTierStatus] Updating range: ${range}`);
    
    const updateResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [['Sold']]
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error(`[updateSheetTierStatus] Failed to update sheet:`, errorText);
      // Return success:false instead of error status to prevent webhook from failing
      return Response.json({ 
        success: false, 
        error: 'Failed to update sheet', 
        details: errorText,
        range: range
      });
    }

    const result = await updateResponse.json();
    console.log(`[updateSheetTierStatus] Update successful:`, JSON.stringify(result));

    return Response.json({ 
      success: true,
      message: `Updated ${leadType} lead row ${rowNumber}, ${tier} to Sold`,
      range: range
    });

  } catch (error) {
    console.error('Error in updateSheetTierStatus:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});