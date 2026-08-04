// Helper function to determine tier based on lead age in days
// Tiers 1-4: 1-3d, 4-14d, 15-30d, 31-90d
// Tier 5: deprecated (was 91+ catch-all, kept for historical records)
// Tier 6: 91-180d, Tier 7: 181-365d, Tier 8: 366+ days
export function getTierFromAge(ageInDays) {
  if (ageInDays >= 1 && ageInDays <= 3) return 'tier1';
  if (ageInDays >= 4 && ageInDays <= 14) return 'tier2';
  if (ageInDays >= 15 && ageInDays <= 30) return 'tier3';
  if (ageInDays >= 31 && ageInDays <= 90) return 'tier4';
  if (ageInDays >= 91 && ageInDays <= 180) return 'tier6';
  if (ageInDays >= 181 && ageInDays <= 365) return 'tier7';
  if (ageInDays >= 366) return 'tier8';
  return 'tier1'; // default
}