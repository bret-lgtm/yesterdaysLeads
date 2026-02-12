import { createClient } from "@base44/sdk";

// When hosted on Base44, the SDK automatically detects 
// the server and the correct auth URLs.
export const base44 = createClient({
  appId: "697a2f6ba7fe7cab15e8500b",
});