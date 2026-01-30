// Helper function to determine tier based on lead age in days
export function getTierFromAge(ageInDays) {
  if (ageInDays >= 1 && ageInDays <= 3) return 'tier1';
  if (ageInDays >= 4 && ageInDays <= 14) return 'tier2';
  if (ageInDays >= 15 && ageInDays <= 30) return 'tier3';
  if (ageInDays >= 31 && ageInDays <= 90) return 'tier4';
  if (ageInDays >= 91) return 'tier5';
  return 'tier1'; // default
}