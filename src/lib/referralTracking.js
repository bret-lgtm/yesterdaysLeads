// Sales rep referral tracking via ?ref= links.
// Captures the referral code on first visit and persists it so it survives
// navigation, login, and the redirect to Stripe checkout + back.

const STORAGE_KEY = 'referral_code';

export function captureReferral() {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      const code = String(ref).trim().slice(0, 64);
      if (code) {
        localStorage.setItem(STORAGE_KEY, code);
      }
    }
  } catch (_) {
    // localStorage may be unavailable; ignore
  }
}

export function getReferralCode() {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch (_) {
    return null;
  }
}

export function clearReferral() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) {}
}