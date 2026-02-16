import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { lead_id, tier } = await req.json();

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
    const [leadType, rowIndex] = lead_id.split('_');
    const rowNumber = parseInt(rowIndex) + 2; // +1 for header row, +1 for 0-based index

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
      return Response.json({ error: 'Failed to fetch sheet metadata' }, { status: 500 });
    }

    const sheetMeta = await sheetMetaResponse.json();
    const sheetMap = {};
    sheetMeta.sheets?.forEach(sheet => {
      const id = sheet.properties.sheetId.toString();
      sheetMap[id] = sheet.properties.title;
    });

    const sheetName = sheetMap[sheetId];
    if (!sheetName) {
      return Response.json({ error: 'Sheet not found' }, { status: 404 });
    }

    // Map tier to column letter (tier_1 = column O, tier_2 = column P, etc.)
    const tierColumns = {
      tier1: 'O',
      tier2: 'P',
      tier3: 'Q',
      tier4: 'R',
      tier5: 'S'
    };

    const columnLetter = tierColumns[tier];
    if (!columnLetter) {
      return Response.json({ error: 'Invalid tier' }, { status: 400 });
    }

    // Update the cell
    const range = `'${sheetName}'!${columnLetter}${rowNumber}`;
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
      console.error('Failed to update sheet:', errorText);
      return Response.json({ error: 'Failed to update sheet' }, { status: 500 });
    }

    return Response.json({ 
      success: true,
      message: `Updated ${leadType} lead row ${rowNumber}, ${tier} to Sold`
    });

  } catch (error) {
    console.error('Error in updateSheetTierStatus:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});