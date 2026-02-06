import { createClient } from "@base44/sdk";

export const base44 = createClient({
  appId: "697a2f6ba7fe7cab15e8500b",
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
  // ADD THIS LINE if the SDK supports it:
  redirectUri: "https://yesterdaysleads.com/api/apps/auth/callback", 
  serverUrl: "https://lead-flow-15e8500b.base44.app",
  baseUrl: "/api",
  axiosConfig: {
    withCredentials: true,
  },
});