import { createClient } from "@base44/sdk";

export const base44 = createClient({
  // Use your actual App ID
  appId: "697a2f6ba7fe7cab15e8500b", 
  
  // 1. Point to your Vercel /api rewrite instead of the direct Base44 URL
  // This helps with "Same-Origin" cookie policies
  baseUrl: "/api", 

  // 2. This is the crucial setting for the 401 error.
  // It tells the browser to include cookies in cross-site requests.
  axiosConfig: {
    withCredentials: true 
  }
});