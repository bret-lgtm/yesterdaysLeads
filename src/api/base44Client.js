import { createClient } from "@base44/sdk";

export const base44 = createClient({
  appId: "697a2f6ba7fe7cab15e8500b",

  // Use the absolute URL for the backend server.
  // This is used by auth functions like redirectToLogin to ensure
  // they go directly to the Base44 authentication service.
  serverUrl: "https://lead-flow-15e8500b.base44.app",

  // Use the relative path for the API proxy.
  // This ensures data-fetching requests go through your Vercel rewrite rule.
  baseUrl: import.meta.env.VITE_BASE44_APP_BASE_URL || "/api",

  axiosConfig: {
    // This is crucial for sending the session cookie with proxied requests.
    withCredentials: true,
  },
});