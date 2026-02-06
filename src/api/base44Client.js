import { createClient } from "@base44/sdk";

export const base44 = createClient({
  appId: "697a2f6ba7fe7cab15e8500b", 
  
  // This now pulls '/api' from Vercel
  baseUrl: import.meta.env.VITE_BASE44_APP_BASE_URL || "/api", 

  axiosConfig: {
    withCredentials: true 
  }
});