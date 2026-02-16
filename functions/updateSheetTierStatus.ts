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

    // Fetch the header row to find tier columns dynamically
    const headerRange = `'${sheetName}'!1:1`;
    const headerResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(headerRange)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!headerResponse.ok) {
      const errorText = await headerResponse.text();
      console.error(`[updateSheetTierStatus] Failed to fetch headers:`, errorText);
      return Response.json({ 
        success: false, 
        error: 'Failed to fetch headers', 
        details: errorText 
      });
    }

    const headerData = await headerResponse.json();
    const headers = headerData.values?.[0] || [];
    
    console.log(`[updateSheetTierStatus] Found ${headers.length} columns, looking for tier columns...`);

    // Find the column index for the specified tier
    const tierColumnName = tier.replace('tier', 'tier_'); // Convert 'tier1' to 'tier_1'
    const columnIndex = headers.findIndex(h => h.toLowerCase() === tierColumnName.toLowerCase());

    if (columnIndex === -1) {
      console.error(`[updateSheetTierStatus] Column '${tierColumnName}' not found in headers:`, headers);
      return Response.json({ 
        success: false, 
        error: `Column '${tierColumnName}' not found in sheet`,
        headers: headers
      });
    }

    // Convert column index to letter (0 = A, 1 = B, etc.)
    const getColumnLetter = (index) => {
      let letter = '';
      while (index >= 0) {
        letter = String.fromCharCode(65 + (index % 26)) + letter;
        index = Math.floor(index / 26) - 1;
      }
      return letter;
    };

    const columnLetter = getColumnLetter(columnIndex);
    
    // Update the cell
    const range = `'${sheetName}'!${columnLetter}${rowNumber}`;
    console.log(`[updateSheetTierStatus] Found column '${tierColumnName}' at index ${columnIndex} (${columnLetter}), updating range: ${range}`);
    
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