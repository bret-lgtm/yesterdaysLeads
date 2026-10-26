// Shared guard for functions that must only ever be called by our own backend
// (the Stripe webhook + order fulfilment flow), never from the public internet.
//
// Internal callers pass the token below in their payload; the public cannot
// know it. A logged-in admin is still allowed through so the admin dashboard
// keeps working.

const TOKEN_NAME = 'INTERNAL_FUNCTION_TOKEN';

export function internalToken() {
  return Deno.env.get(TOKEN_NAME);
}

export function isInternalCaller(payload) {
  const expected = Deno.env.get(TOKEN_NAME);
  if (!expected) return false;
  return !!payload && typeof payload.internal_token === 'string' && payload.internal_token === expected;
}

// Admin dashboard callers, and internal server callers, are both allowed.
export async function isTrustedCaller(base44, payload) {
  if (isInternalCaller(payload)) return true;
  const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
  return !!user && user.role === 'admin';
}