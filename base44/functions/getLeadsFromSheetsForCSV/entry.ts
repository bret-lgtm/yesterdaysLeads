import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// Google Sheets config — same as getLeadsFromSheets
const SHEET_IDS = {
  auto: '44023422',
  home: '1745292620',
  health: '1305861843',
  life: '113648240',
  medicare: '757044649',
  final_expense: '387991684',
  veteran_life: '1401332567',
  retirement: '712013125',
  annuity: '409761548',
  recruiting: '1894668336'
};
const SHEET_NAMES = {
  '44023422': 'Auto Leads',
  '113648240': 'Life Leads',
  '387991684': 'Final Expense Leads',
  '409761548': 'Annuity Leads',
  '712013125': 'Retirement Leads',
  '757044649': 'Medicare Leads',
  '1305861843': 'Health Leads',
  '1401332567': 'Veteran Life Leads',
  '1745292620': 'Home Leads',
  '1894668336': 'Recruiting Leads'
};

// Determines if an ID is a Google Sheets row-based ID (e.g. "veteran_life_489")
// vs a Supabase UUID
function isSheetId(id) {
  return /^[a-z_]+_\d+$/.test(id);
}

// Extract lead type from a sheet-based ID like "veteran_life_489" → "veteran_life"
function getLeadTypeFromSheetId(id) {
  const match = id.match(/^(.+)_(\d+)$/);
  return match ? match[1] : null;
}

// Extract row index from a sheet-based ID like "veteran_life_489" → 489
function getRowIndexFromSheetId(id) {
  const match = id.match(/^(.+)_(\d+)$/);
  return match ? parseInt(match[2]) : null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized', leads: [] }, { status: 401 });
    }

    const { lead_ids = [] } = await req.json();

    if (!lead_ids || lead_ids.length === 0) {
      return Response.json({ success: false, error: 'No lead IDs provided', leads: [] });
    }

    const uniqueLeadIds = [...new Set(lead_ids)];
    
    // Split into Supabase UUIDs vs Google Sheets row IDs
    const supabaseIds = uniqueLeadIds.filter(id => !isSheetId(id));
    const sheetIds = uniqueLeadIds.filter(id => isSheetId(id));

    console.log(`Total IDs: ${uniqueLeadIds.length} — Supabase: ${supabaseIds.length}, Sheets: ${sheetIds.length}`);

    let allLeads = [];

    // --- Fetch Supabase leads ---
    if (supabaseIds.length > 0) {
      const BATCH_SIZE = 200;
      for (let i = 0; i < supabaseIds.length; i += BATCH_SIZE) {
        const batch = supabaseIds.slice(i, i + BATCH_SIZE);
        const idList = batch.map(id => `"${id}"`).join(',');

        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/aged_leads?id=in.(${idList})&select=*`,
          {
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (!res.ok) {
          console.error('Supabase fetch error:', await res.text());
          continue;
        }

        const rows = await res.json();
        // Format Supabase leads
        const formatted = rows.map(lead => {
          let age_in_days = 0;
          if (lead.external_id) {
            const dateStr = lead.external_id.split('-')[0];
            if (dateStr.length === 8) {
              const year = parseInt(dateStr.substring(0, 4));
              const month = parseInt(dateStr.substring(4, 6)) - 1;
              const day = parseInt(dateStr.substring(6, 8));
              const uploadDate = new Date(year, month, day);
              if (!isNaN(uploadDate.getTime())) {
                age_in_days = Math.floor((Date.now() - uploadDate) / (1000 * 60 * 60 * 24));
              }
            }
          }
          const { custom_data, tier_1_sold, tier_2_sold, tier_3_sold, tier_4_sold, tier_5_sold, created_at, ...coreFields } = lead;
          return {
            ...coreFields,
            age_in_days,
            ...(custom_data || {}),
          };
        });
        allLeads = allLeads.concat(formatted);
      }
    }

    // --- Fetch Google Sheets leads ---
    if (sheetIds.length > 0) {
      const apiKey = Deno.env.get('GOOGLE_API_KEY');
      const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');

      // Group requested IDs by lead type
      const byType = {};
      for (const id of sheetIds) {
        const type = getLeadTypeFromSheetId(id);
        if (!type) continue;
        if (!byType[type]) byType[type] = [];
        byType[type].push(id);
      }

      for (const [leadType, idsForType] of Object.entries(byType)) {
        const sheetGid = SHEET_IDS[leadType];
        const sheetName = SHEET_NAMES[sheetGid];
        if (!sheetName) {
          console.error(`No sheet name for lead type: ${leadType}`);
          continue;
        }

        const range = `'${sheetName}'!A:Z`;
        const res = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`
        );

        if (!res.ok) {
          console.error(`Failed to fetch sheet ${sheetName}:`, await res.text());
          continue;
        }

        const data = await res.json();
        const rows = data.values || [];
        if (rows.length < 2) continue;

        const headers = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
        const dataRows = rows.slice(1);

        // Build index set of requested row indices
        const requestedIndices = new Set(idsForType.map(id => getRowIndexFromSheetId(id)));

        for (const rowIndex of requestedIndices) {
          const row = dataRows[rowIndex];
          if (!row) continue;

          const lead = {};
          headers.forEach((header, i) => {
            lead[header] = row[i] || '';
          });

          lead.lead_id = `${leadType}_${rowIndex}`;
          lead.lead_type = leadType;

          // Calculate age_in_days
          if (lead.external_id) {
            const dateStr = lead.external_id.split('-')[0];
            if (dateStr.length === 8) {
              const year = parseInt(dateStr.substring(0, 4));
              const month = parseInt(dateStr.substring(4, 6)) - 1;
              const day = parseInt(dateStr.substring(6, 8));
              const uploadDate = new Date(year, month, day);
              if (!isNaN(uploadDate.getTime())) {
                lead.age_in_days = Math.floor((Date.now() - uploadDate) / (1000 * 60 * 60 * 24));
              }
            }
          }

          allLeads.push(lead);
        }

        console.log(`Fetched ${requestedIndices.size} ${leadType} leads from Google Sheets`);
      }
    }

    return Response.json({
      success: true,
      leads: allLeads,
      total: allLeads.length
    });

  } catch (error) {
    console.error('CSV fetch error:', error);
    return Response.json({ success: false, error: error.message, leads: [] }, { status: 500 });
  }
});