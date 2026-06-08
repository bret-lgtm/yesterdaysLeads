import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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
  return { emails, phones, externalIds };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

  const ORDER2_ID = '6a245c4e490da085b743caa6';

  const [order2Results, order1Data] = await Promise.all([
    base44.asServiceRole.entities.Order.filter({ id: ORDER2_ID }),
    fetchOrder1EmailsFromCSV()
  ]);

  const order2 = order2Results[0];
  const { emails: order1Emails, phones: order1Phones, externalIds: order1ExtIds } = order1Data;

  const snapshot = order2.lead_data_snapshot || [];
  const dupes = [];
  const clean = [];

  for (const snap of snapshot) {
    const email = (snap.email || '').trim().toLowerCase();
    const phone = (snap.phone || '').toString().replace(/\D/g, '').slice(-10);
    const extId = (snap.external_id || '').trim();

    const emailMatch = email && order1Emails.has(email);
    const phoneMatch = phone && phone.length >= 10 && order1Phones.has(phone);
    const extIdMatch = extId && order1ExtIds.has(extId);

    if (emailMatch || phoneMatch || extIdMatch) {
      dupes.push({
        external_id: extId,
        name: `${snap.first_name} ${snap.last_name}`,
        email: snap.email,
        phone: snap.phone,
        match_reason: emailMatch ? 'email' : phoneMatch ? 'phone' : 'external_id'
      });
    } else {
      clean.push(snap);
    }
  }

  console.log(`Order2 snapshot: ${snapshot.length} total, ${dupes.length} dupes, ${clean.length} clean`);

  return Response.json({
    order2_total: snapshot.length,
    dupes_found: dupes.length,
    clean_count: clean.length,
    all_dupes: dupes
  });
});