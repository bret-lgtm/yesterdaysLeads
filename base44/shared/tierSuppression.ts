// Tier-based sale suppression.
//
// A lead's current-age tier can only be sold once for tiers 1-4 (tier 5+ may be
// resold). Sales live in LeadSuppression, one row per lead + tier. The table holds
// far more rows than a single list() returns (it silently caps at 5,000), so we look
// up only the leads in the current order, in batches, instead of paging the table.

export function getTierNumFromAge(days) {
  if (days >= 1 && days <= 3) return 1;
  if (days >= 4 && days <= 14) return 2;
  if (days >= 15 && days <= 30) return 3;
  if (days >= 31 && days <= 90) return 4;
  if (days >= 91 && days <= 180) return 5;
  if (days >= 181 && days <= 365) return 6;
  if (days >= 366) return 7;
  return 1;
}

// Only tiers 1-4 are limited to a single sale.
const LIMITED_TIERS = ['tier1', 'tier2', 'tier3', 'tier4'];
const BATCH_SIZE = 50;

// Returns every "lead_id:tierN" sale recorded for the given leads in a limited tier.
export async function getSoldTierKeys(entities, leadIds) {
  const ids = [...new Set((leadIds || []).filter(Boolean))];
  const sold = new Set();
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const records = await entities.LeadSuppression.filter({
      lead_id: { $in: batch },
      tier: { $in: LIMITED_TIERS }
    });
    for (const record of records) sold.add(`${record.lead_id}:${record.tier}`);
  }
  return sold;
}