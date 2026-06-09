import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Fix order 6a2819c02b73c520b9fff864 (theogerges2006@gmail.com)
// Remove FE-162 (Theresa Bolduc) and FE-025 (Sonny Golden) - duplicates from order 1
// Replace with 2 fresh FL final_expense leads

const DUPE_EXTERNAL_IDS = new Set(['20260309-FE-162', '20260309-FE-025']);
const ORDER_ID = '6a2819c02b73c520b9fff864';
const LEAD_TYPE = 'final_expense';
const TARGET_STATE = 'FL';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

  const { dry_run = true } = await req.json().catch(() => ({}));

  // Load order
  const order = (await base44.asServiceRole.entities.Order.filter({ id: ORDER_ID }))[0];
  if (!order) return Response.json({ error: 'Order not found' }, { status: 404 });

  const snapshot = order.lead_data_snapshot || [];
  const dupes = snapshot.filter(s => DUPE_EXTERNAL_IDS.has(s.external_id));
  const clean = snapshot.filter(s => !DUPE_EXTERNAL_IDS.has(s.external_id));
  console.log(`Dupes found: ${dupes.length}, Clean leads: ${clean.length}`);

  // Load suppression — build set of all sold external_ids
  const suppressionRecords = await base44.asServiceRole.entities.LeadSuppression.list('', 50000);
  const soldLeadIds = new Set(suppressionRecords.map(r => r.lead_id));

  // Also get all external_ids from all customer orders
  const customerOrders = await base44.asServiceRole.entities.Order.filter({ customer_id: order.customer_id });
  const ownedExternalIds = new Set();
  for (const o of customerOrders) {
    for (const snap of (o.lead_data_snapshot || [])) {
      if (snap.external_id) ownedExternalIds.add(snap.external_id);
    }
  }
  // Remove the dupes we're replacing so they don't block candidates
  DUPE_EXTERNAL_IDS.forEach(id => ownedExternalIds.delete(id));
  console.log(`Customer owns ${ownedExternalIds.size} external IDs`);

  // Fetch sheet data
  const apiKey = Deno.env.get('GOOGLE_API_KEY');
  const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');

  const range = `'Final Expense Leads'!A1:Z50000`;
  const sheetRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&key=${apiKey}`
  );
  const sheetData = await sheetRes.json();
  const rows = sheetData.values || [];
  if (rows.length < 2) return Response.json({ error: 'No sheet data' }, { status: 500 });

  const headers = rows[0];
  const today = new Date();

  const calcAge = (extId) => {
    const dateStr = String(extId || '').split('-')[0];
    if (dateStr.length !== 8) return 0;
    const y = parseInt(dateStr.substring(0, 4));
    const m = parseInt(dateStr.substring(4, 6)) - 1;
    const d = parseInt(dateStr.substring(6, 8));
    const uploadDate = new Date(y, m, d);
    return Math.floor((today - uploadDate) / (1000 * 60 * 60 * 24));
  };

  // Find 2 fresh FL leads not already sold or owned
  const replacements = [];
  for (let i = 1; i < rows.length && replacements.length < 2; i++) {
    const lead = {};
    headers.forEach((h, idx) => { lead[h.trim().toLowerCase().replace(/\s+/g, '_')] = rows[i][idx] || ''; });
    lead.external_id = String(lead.external_id || '').trim();
    lead.state = String(lead.state || '').trim();
    lead.age_in_days = calcAge(lead.external_id);

    if (lead.state !== TARGET_STATE) continue;
    if (!lead.external_id) continue;
    if (DUPE_EXTERNAL_IDS.has(lead.external_id)) continue;
    if (ownedExternalIds.has(lead.external_id)) continue;

    // Check sold by external_id (suppression uses row-index IDs, so also check by position)
    const rowId = `${LEAD_TYPE}_${i - 1}`;
    if (soldLeadIds.has(rowId)) continue;

    const statusVal = String(lead.status || '').trim().toLowerCase();
    if (statusVal && statusVal !== 'available' && statusVal !== 'undefined') continue;

    replacements.push({ ...lead, _row_id: rowId });
  }

  console.log(`Found ${replacements.length} replacement leads`);
  replacements.forEach(r => console.log(`  Replacement: ${r.external_id} - ${r.first_name} ${r.last_name}, ${r.state}`));

  if (replacements.length < 2) {
    return Response.json({ error: `Only found ${replacements.length} replacement FL leads`, replacements }, { status: 400 });
  }

  if (dry_run) {
    return Response.json({
      dry_run: true,
      removing: dupes.map(d => ({ external_id: d.external_id, name: `${d.first_name} ${d.last_name}` })),
      adding: replacements.map(r => ({ external_id: r.external_id, name: `${r.first_name} ${r.last_name}`, state: r.state, age_in_days: r.age_in_days }))
    });
  }

  // Build new snapshot
  const newSnapshot = [
    ...clean,
    ...replacements.map(r => {
      const snap = {};
      Object.entries(r).forEach(([k, v]) => {
        if (!['_row_id', '_available'].includes(k)) snap[k] = v;
      });
      snap.lead_type = 'Final Expense';
      return snap;
    })
  ];

  // Build new leads_purchased (keep non-dupe UUIDs, add row IDs for new leads)
  const dupeUUIDs = new Set();
  for (const snap of dupes) {
    const uuid = (order.leads_purchased || []).find(lid => {
      const match = snapshot.find(s => s.external_id === snap.external_id);
      return false; // UUIDs don't map directly via snapshot; keep all non-matching
    });
  }
  // Simpler: remove the 2 UUID entries that correspond to FE-162 and FE-025
  // We know from DB: FE-162 = 8530a0f4-b660-4a92-976c-0ff588451e85, FE-025 = b2ab3a0b-acbf-4c51-bb92-de5928593e07
  const dupeUUIDSet = new Set([
    '8530a0f4-b660-4a92-976c-0ff588451e85',
    'b2ab3a0b-acbf-4c51-bb92-de5928593e07'
  ]);
  const newLeadIds = [
    ...(order.leads_purchased || []).filter(id => !dupeUUIDSet.has(id)),
    ...replacements.map(r => r._row_id)
  ];

  await base44.asServiceRole.entities.Order.update(ORDER_ID, {
    leads_purchased: newLeadIds,
    lead_data_snapshot: newSnapshot,
    lead_count: newLeadIds.length
  });

  // Add suppression records for replacements
  const getTier = (days) => {
    if (days <= 3) return 'tier1';
    if (days <= 14) return 'tier2';
    if (days <= 30) return 'tier3';
    if (days <= 90) return 'tier4';
    return 'tier5';
  };

  for (const r of replacements) {
    await base44.asServiceRole.entities.LeadSuppression.create({
      lead_id: r._row_id,
      tier: getTier(r.age_in_days || 0),
      order_id: ORDER_ID,
      sale_date: new Date().toISOString()
    });
  }

  console.log(`Successfully replaced 2 duplicate leads in order ${ORDER_ID}`);

  return Response.json({
    success: true,
    removed: dupes.map(d => ({ external_id: d.external_id, name: `${d.first_name} ${d.last_name}` })),
    added: replacements.map(r => ({ external_id: r.external_id, name: `${r.first_name} ${r.last_name}`, state: r.state })),
    total_leads: newLeadIds.length
  });
});