import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
const GOOGLE_SHEET_ID = Deno.env.get('GOOGLE_SHEET_ID');

// The actual Order 1 emails extracted from the uploaded CSV
// (all 508 emails from leads-veteran_life-order-6a15cb8c1998b43e58ed56d5.csv)
const ORDER1_CSV_URL = 'https://media.base44.com/files/public/697a2f6ba7fe7cab15e8500b/4fc3c735e_leads-veteran_life-order-6a15cb8c1998b43e58ed56d5.csv';

async function fetchOrder1EmailsFromCSV() {
  const res = await fetch(ORDER1_CSV_URL);
  const text = await res.text();
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
  const emailIdx = headers.indexOf('email');
  const phoneIdx = headers.indexOf('phone');
  const extIdIdx = headers.indexOf('external_id');

  const emails = new Set();
  const phones = new Set();
  const externalIds = new Set();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
    const email = cols[emailIdx]?.toLowerCase().trim();
    const phone = cols[phoneIdx]?.replace(/\D/g, '').slice(-10);
    const extId = cols[extIdIdx]?.trim();
    if (email) emails.add(email);
    if (phone && phone.length >= 10) phones.add(phone);
    if (extId) externalIds.add(extId);
  }

  console.log(`Order1 CSV: ${emails.size} emails, ${phones.size} phones, ${externalIds.size} external_ids`);
  return { emails, phones, externalIds };
}

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
    lead.lead_type = 'veteran_life';
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
  if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

  const ORDER2_ID = '6a245c4e490da085b743caa6';

  const [order2Results, order1Data, allSheetLeads, suppressionRecords] = await Promise.all([
    base44.asServiceRole.entities.Order.filter({ id: ORDER2_ID }),
    fetchOrder1EmailsFromCSV(),
    fetchAllVetLeadsFromSheet(),
    base44.asServiceRole.entities.LeadSuppression.list('', 50000)
  ]);

  const order2 = order2Results[0];
  if (!order2) return Response.json({ error: 'Order 2 not found' }, { status: 404 });

  const { emails: order1Emails, phones: order1Phones, externalIds: order1ExternalIds } = order1Data;

  const order2Snapshot = order2.lead_data_snapshot || [];

  // Classify each Order 2 snapshot lead as dupe or clean
  const dupes = [];
  const clean = [];

  for (const snap of order2Snapshot) {
    const snapEmail = (snap.email || '').trim().toLowerCase();
    const snapPhone = (snap.phone || '').toString().replace(/\D/g, '').slice(-10);
    const snapExtId = (snap.external_id || '').trim();

    const isDupe =
      (snapEmail && order1Emails.has(snapEmail)) ||
      (snapPhone && snapPhone.length >= 10 && order1Phones.has(snapPhone)) ||
      (snapExtId && order1ExternalIds.has(snapExtId));

    if (isDupe) dupes.push(snap);
    else clean.push(snap);
  }

  console.log(`Dupes found: ${dupes.length}, Clean: ${clean.length}`);

  // We need to replace ALL 160 leads (not just the dupes) per the user's request
  // Build exclusion sets from order1 CSV data
  const suppressedIds = new Set(suppressionRecords.map(r => r.lead_id));
  
  // Collect all emails already in Order 2 clean leads (so we don't give him those again)
  const order2CleanEmails = new Set(clean.map(l => (l.email || '').trim().toLowerCase()).filter(Boolean));
  const order2CleanPhones = new Set(clean.map(l => (l.phone || '').toString().replace(/\D/g, '').slice(-10)).filter(p => p.length >= 10));

  const allExcludedEmails = new Set([...order1Emails, ...order2CleanEmails]);
  const allExcludedPhones = new Set([...order1Phones, ...order2CleanPhones]);
  const allExcludedExtIds = new Set([...order1ExternalIds]);

  // Get age range of Order 2 snapshot for matching (roughly same vintage)
  const order2Ages = order2Snapshot.map(l => parseInt(l.age_in_days) || 0).filter(a => a > 0);
  const minAge = Math.min(...order2Ages);
  const maxAge = Math.max(...order2Ages);
  console.log(`Order2 age range: ${minAge} - ${maxAge} days`);

  // Find fresh replacements from sheet
  const freshCandidates = allSheetLeads.filter(lead => {
    if (suppressedIds.has(lead.lead_id)) return false;
    const email = (lead.email || '').trim().toLowerCase();
    if (email && allExcludedEmails.has(email)) return false;
    const phone = (lead.phone || '').toString().replace(/\D/g, '').slice(-10);
    if (phone && phone.length >= 10 && allExcludedPhones.has(phone)) return false;
    if (lead.external_id && allExcludedExtIds.has(lead.external_id.trim())) return false;
    const tier5 = (lead.tier_5_sold || lead.tier_5 || '').toString().trim().toLowerCase();
    if (tier5 === 'sold' || tier5 === 'true' || tier5 === '1') return false;
    return true;
  });

  console.log(`Fresh candidates available: ${freshCandidates.length}`);

  const needed = 160;
  if (freshCandidates.length < needed) {
    return Response.json({
      error: `Not enough fresh leads. Need ${needed}, only ${freshCandidates.length} available.`,
      dupes_in_order2: dupes.length,
      clean_in_order2: clean.length,
      fresh_candidates: freshCandidates.length
    }, { status: 400 });
  }

  const replacements = freshCandidates.slice(0, needed);

  const newSnapshot = replacements.map(l => ({
    external_id: l.external_id || l.lead_id,
    lead_type: 'veteran_life',
    first_name: l.first_name || '',
    last_name: l.last_name || '',
    email: l.email || '',
    phone: l.phone || '',
    date_of_birth: l.date_of_birth || '',
    city: l.city || 'Unknown',
    state: l.state || 'Unknown',
    zip_code: l.zip_code || '',
    branch_of_service: l.branch_of_service || '',
    favorite_hobby: l.favorite_hobby || '',
    disability_rating: l.disability_rating || '',
    age_in_days: l.age_in_days || 0
  }));

  const newLeadsPurchased = replacements.map(l => l.lead_id);

  // Update the order
  await base44.asServiceRole.entities.Order.update(ORDER2_ID, {
    lead_data_snapshot: newSnapshot,
    leads_purchased: newLeadsPurchased,
    lead_count: newSnapshot.length
  });

  // Create suppression records for replacements in bulk
  const suppressionEntries = replacements.map(lead => ({
    lead_id: lead.lead_id,
    tier: 'tier5',
    order_id: ORDER2_ID,
    sale_date: new Date().toISOString()
  }));
  await base44.asServiceRole.entities.LeadSuppression.bulkCreate(suppressionEntries);

  // Update customer suppression list
  const customerResults = await base44.asServiceRole.entities.Customer.filter({ email: 'elvir@modernfinancialllc.com' });
  const customer = customerResults[0];
  if (customer) {
    const existing = customer.suppression_list || [];
    const newSuppressionList = [...new Set([...existing, ...newLeadsPurchased])];
    await base44.asServiceRole.entities.Customer.update(customer.id, { suppression_list: newSuppressionList });
  }

  return Response.json({
    success: true,
    dupes_removed: dupes.length,
    total_replaced: needed,
    new_total_leads: newSnapshot.length,
    sample_replacements: replacements.slice(0, 5).map(l => ({
      external_id: l.external_id,
      name: `${l.first_name} ${l.last_name}`,
      email: l.email,
      age_in_days: l.age_in_days
    }))
  });
});