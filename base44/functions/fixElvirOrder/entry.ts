import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
const GOOGLE_SHEET_ID = Deno.env.get('GOOGLE_SHEET_ID');
const VET_SHEET_NAME = 'Veteran Life Leads'; // tab name for veteran_life

async function fetchAllVetLeadsFromSheet() {
  const range = `'${VET_SHEET_NAME}'!A:Z`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/${encodeURIComponent(range)}?key=${GOOGLE_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.values || data.values.length < 2) {
    console.error('Sheet fetch error or empty:', JSON.stringify(data).substring(0, 300));
    return [];
  }
  const headers = data.values[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const dataRows = data.values.slice(1);
  console.log(`Fetched ${dataRows.length} rows from sheet`);

  return dataRows.map((row, i) => {
    const lead = {};
    headers.forEach((h, j) => { lead[h] = row[j] !== undefined ? row[j] : ''; });
    lead.lead_id = `veteran_life_${i + 1}`;
    lead.lead_type = 'veteran_life';
    // Calculate age from external_id
    const extId = lead.external_id || '';
    const dateStr = extId.split('-')[0];
    if (dateStr && dateStr.length === 8) {
      const y = parseInt(dateStr.substring(0, 4));
      const m = parseInt(dateStr.substring(4, 6)) - 1;
      const d = parseInt(dateStr.substring(6, 8));
      const uploadDate = new Date(y, m, d);
      if (!isNaN(uploadDate.getTime())) {
        lead.age_in_days = Math.floor((Date.now() - uploadDate.getTime()) / 86400000);
      }
    }
    return lead;
  });
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') {
    return Response.json({ error: 'Admin only' }, { status: 403 });
  }

  const ORDER1_ID = '6a15cb8c1998b43e58ed56d5'; // May 26 - sheet IDs
  const ORDER2_ID = '6a245c4e490da085b743caa6'; // June 6 - Supabase UUIDs

  const [order1Results, order2Results] = await Promise.all([
    base44.asServiceRole.entities.Order.filter({ id: ORDER1_ID }),
    base44.asServiceRole.entities.Order.filter({ id: ORDER2_ID })
  ]);
  const order1 = order1Results[0];
  const order2 = order2Results[0];

  if (!order1 || !order2) {
    return Response.json({ error: 'Could not find orders' }, { status: 404 });
  }

  // Fetch ALL vet life leads from sheet
  const allSheetLeads = await fetchAllVetLeadsFromSheet();
  console.log(`Total sheet leads: ${allSheetLeads.length}`);

  // Build lead_id -> lead map
  const sheetLeadMap = {};
  allSheetLeads.forEach(l => { sheetLeadMap[l.lead_id] = l; });

  // Collect Order 1 emails/phones
  const order1Emails = new Set();
  const order1Phones = new Set();
  let matched = 0;
  for (const id of (order1.leads_purchased || [])) {
    const lead = sheetLeadMap[id];
    if (lead) {
      matched++;
      if (lead.email) order1Emails.add(lead.email.trim().toLowerCase());
      const phone = (lead.phone || '').toString().replace(/\D/g, '').slice(-10);
      if (phone.length >= 10) order1Phones.add(phone);
    }
  }
  console.log(`Order 1 leads matched: ${matched}/${order1.leads_purchased?.length}, emails: ${order1Emails.size}`);

  // Find duplicates in Order 2 snapshot
  const order2Snapshot = order2.lead_data_snapshot || [];
  const duplicateLeads = [];
  const uniqueLeads = [];

  for (const lead of order2Snapshot) {
    const email = (lead.email || '').trim().toLowerCase();
    const phone = (lead.phone || '').toString().replace(/\D/g, '').slice(-10);
    const isDupe = (email && order1Emails.has(email)) || (phone && phone.length >= 10 && order1Phones.has(phone));
    if (isDupe) {
      duplicateLeads.push(lead);
    } else {
      uniqueLeads.push(lead);
    }
  }

  console.log(`Duplicates: ${duplicateLeads.length}, Unique: ${uniqueLeads.length}`);

  if (duplicateLeads.length === 0) {
    return Response.json({
      message: 'No duplicates found',
      order1_emails: order1Emails.size,
      order1_matched: matched,
      order2_snapshot_size: order2Snapshot.length
    });
  }

  // Get suppression list
  const suppressionRecords = await base44.asServiceRole.entities.LeadSuppression.list('', 50000);
  const suppressedIds = new Set(suppressionRecords.map(r => r.lead_id));

  // All emails to avoid (both orders combined)
  const order2Emails = new Set(order2Snapshot.map(l => (l.email || '').trim().toLowerCase()).filter(Boolean));
  const allUsedEmails = new Set([...order1Emails, ...order2Emails]);
  const order1IdSet = new Set(order1.leads_purchased || []);

  // Find fresh replacements
  const freshCandidates = allSheetLeads.filter(lead => {
    if (suppressedIds.has(lead.lead_id)) return false;
    if (order1IdSet.has(lead.lead_id)) return false;
    const email = (lead.email || '').trim().toLowerCase();
    if (email && allUsedEmails.has(email)) return false;
    const tier5 = (lead.tier_5 || '').toString().trim().toLowerCase();
    if (tier5 === 'sold') return false;
    return true;
  });

  console.log(`Fresh candidates: ${freshCandidates.length}`);

  const needed = duplicateLeads.length;
  if (freshCandidates.length < needed) {
    return Response.json({
      error: `Not enough fresh leads. Need ${needed}, only ${freshCandidates.length} available.`,
      duplicates_found: needed
    }, { status: 400 });
  }

  const replacements = freshCandidates.slice(0, needed);

  // Build new snapshot
  const replacementSnapshots = replacements.map(l => ({
    external_id: l.external_id || l.lead_id,
    lead_type: 'veteran_life',
    first_name: l.first_name,
    last_name: l.last_name,
    email: l.email,
    phone: l.phone,
    date_of_birth: l.date_of_birth,
    city: l.city || 'Unknown',
    state: l.state || 'Unknown',
    zip_code: l.zip_code,
    branch_of_service: l.branch_of_service,
    favorite_hobby: l.favorite_hobby,
    disability_rating: l.disability_rating,
    age_in_days: l.age_in_days
  }));

  const newSnapshot = [...uniqueLeads, ...replacementSnapshots];

  // Remove dupe UUIDs from leads_purchased, add replacement sheet IDs
  const dupeExternalIds = new Set(duplicateLeads.map(l => l.external_id));
  const dupeUUIDs = new Set();
  order2Snapshot.forEach((snap, idx) => {
    if (dupeExternalIds.has(snap.external_id)) {
      const uuid = order2.leads_purchased[idx];
      if (uuid) dupeUUIDs.add(uuid);
    }
  });

  const newLeadsPurchased = [
    ...order2.leads_purchased.filter(id => !dupeUUIDs.has(id)),
    ...replacements.map(l => l.lead_id)
  ];

  // Update order
  await base44.asServiceRole.entities.Order.update(ORDER2_ID, {
    lead_data_snapshot: newSnapshot,
    leads_purchased: newLeadsPurchased,
    lead_count: newSnapshot.length
  });

  // Create suppression records
  for (const lead of replacements) {
    await base44.asServiceRole.entities.LeadSuppression.create({
      lead_id: lead.lead_id,
      tier: 'tier5',
      order_id: ORDER2_ID,
      sale_date: new Date().toISOString()
    });
  }

  // Update customer suppression list
  const customerResults = await base44.asServiceRole.entities.Customer.filter({ email: 'elvir@modernfinancialllc.com' });
  const customer = customerResults[0];
  if (customer) {
    const existing = customer.suppression_list || [];
    const newSuppressionList = [...new Set([...existing, ...replacements.map(l => l.lead_id)])];
    await base44.asServiceRole.entities.Customer.update(customer.id, { suppression_list: newSuppressionList });
  }

  return Response.json({
    success: true,
    duplicates_replaced: duplicateLeads.length,
    replacements_added: replacements.length,
    new_total_leads: newSnapshot.length,
    sample_dupes: duplicateLeads.slice(0, 5).map(l => ({ name: `${l.first_name} ${l.last_name}`, email: l.email })),
    sample_replacements: replacements.slice(0, 5).map(l => ({ name: `${l.first_name} ${l.last_name}`, email: l.email }))
  });
});