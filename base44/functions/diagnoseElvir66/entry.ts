import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
const GOOGLE_SHEET_ID = Deno.env.get('GOOGLE_SHEET_ID');

async function fetchAllVetLeadsFromSheet() {
  const range = `'Veteran Life Leads'!A:Z`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/${encodeURIComponent(range)}?key=${GOOGLE_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.values || data.values.length < 2) return [];
  const headers = data.values[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return data.values.slice(1).map((row, i) => {
    const lead = {};
    headers.forEach((h, j) => { lead[h] = row[j] !== undefined ? row[j] : ''; });
    lead.lead_id = `veteran_life_${i + 1}`;
    return lead;
  });
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

  const ORDER1_ID = '6a15cb8c1998b43e58ed56d5';
  const ORDER2_ID = '6a245c4e490da085b743caa6';

  const [o1r, o2r, sheetLeads] = await Promise.all([
    base44.asServiceRole.entities.Order.filter({ id: ORDER1_ID }),
    base44.asServiceRole.entities.Order.filter({ id: ORDER2_ID }),
    fetchAllVetLeadsFromSheet()
  ]);

  const order1 = o1r[0];
  const order2 = o2r[0];

  // Build sheet map by lead_id
  const sheetById = {};
  sheetLeads.forEach(l => { sheetById[l.lead_id] = l; });

  // Build sheet map by external_id
  const sheetByExtId = {};
  sheetLeads.forEach(l => { if (l.external_id) sheetByExtId[l.external_id.trim()] = l; });

  // Build Order 1 email set from sheet
  const order1Emails = new Set();
  for (const id of (order1.leads_purchased || [])) {
    const lead = sheetById[id];
    if (lead?.email) order1Emails.add(lead.email.trim().toLowerCase());
  }

  // Find the 66 "unique" snapshot leads in Order 2 that weren't flagged as dupes
  const order2Snapshot = order2.lead_data_snapshot || [];
  const results = [];

  for (const snap of order2Snapshot) {
    const snapEmail = (snap.email || '').trim().toLowerCase();
    const isInOrder1ByEmail = snapEmail && order1Emails.has(snapEmail);

    // Find the sheet lead for this snapshot by external_id
    const sheetLead = sheetByExtId[snap.external_id?.trim()] || null;
    const sheetEmail = sheetLead ? (sheetLead.email || '').trim().toLowerCase() : null;
    const sheetEmailInOrder1 = sheetEmail && order1Emails.has(sheetEmail);

    if (!isInOrder1ByEmail) {
      results.push({
        external_id: snap.external_id,
        snapshot_email: snap.email,
        sheet_email: sheetLead?.email || 'NOT FOUND IN SHEET',
        emails_match: snapEmail === sheetEmail,
        sheet_email_in_order1: sheetEmailInOrder1,
        blank_email: !snap.email
      });
    }
  }

  const blankCount = results.filter(r => r.blank_email).length;
  const mismatchCount = results.filter(r => !r.emails_match && !r.blank_email).length;
  const sheetEmailInOrder1Count = results.filter(r => r.sheet_email_in_order1).length;

  return Response.json({
    total_not_matched: results.length,
    blank_email_count: blankCount,
    email_mismatch_count: mismatchCount,
    sheet_email_also_in_order1: sheetEmailInOrder1Count,
    sample: results.slice(0, 20)
  });
});