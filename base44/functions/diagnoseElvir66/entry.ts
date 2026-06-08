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

  // Build maps
  const sheetById = {};
  const sheetByExtId = {};
  sheetLeads.forEach(l => {
    sheetById[l.lead_id] = l;
    if (l.external_id) sheetByExtId[l.external_id.trim()] = l;
  });

  // Build Order 1 email set AND snapshot email set from its own snapshot
  const order1SheetEmails = new Set();
  const order1SnapshotEmails = new Set();

  for (const id of (order1.leads_purchased || [])) {
    const lead = sheetById[id];
    if (lead?.email) order1SheetEmails.add(lead.email.trim().toLowerCase());
  }
  for (const snap of (order1.lead_data_snapshot || [])) {
    if (snap?.email) order1SnapshotEmails.add(snap.email.trim().toLowerCase());
  }

  console.log(`Order1 sheet emails: ${order1SheetEmails.size}, snapshot emails: ${order1SnapshotEmails.size}`);

  // Combine both for the most thorough check
  const allOrder1Emails = new Set([...order1SheetEmails, ...order1SnapshotEmails]);

  const order2Snapshot = order2.lead_data_snapshot || [];
  const dupes = [];
  const clean = [];

  for (const snap of order2Snapshot) {
    const snapEmail = (snap.email || '').trim().toLowerCase();
    const sheetLead = sheetByExtId[snap.external_id?.trim()] || null;
    const sheetEmail = sheetLead ? (sheetLead.email || '').trim().toLowerCase() : '';

    // Check both snapshot email AND current sheet email against both order1 email sets
    const isDupe =
      (snapEmail && allOrder1Emails.has(snapEmail)) ||
      (sheetEmail && allOrder1Emails.has(sheetEmail));

    const entry = {
      external_id: snap.external_id,
      first_name: snap.first_name,
      last_name: snap.last_name,
      snapshot_email: snap.email,
      sheet_email: sheetLead?.email || 'NOT IN SHEET',
      in_order1_by_snapshot_email: snapEmail ? allOrder1Emails.has(snapEmail) : false,
      in_order1_by_sheet_email: sheetEmail ? allOrder1Emails.has(sheetEmail) : false,
      is_dupe: isDupe
    };

    if (isDupe) dupes.push(entry);
    else clean.push(entry);
  }

  console.log(`Dupes: ${dupes.length}, Clean: ${clean.length}`);

  return Response.json({
    order1_sheet_emails: order1SheetEmails.size,
    order1_snapshot_emails: order1SnapshotEmails.size,
    order1_combined_emails: allOrder1Emails.size,
    order2_total: order2Snapshot.length,
    dupes_found: dupes.length,
    clean_count: clean.length,
    all_dupes: dupes,
    sample_clean: clean.slice(0, 10)
  });
});