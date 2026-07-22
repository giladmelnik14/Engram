import { createClient } from "@base44/sdk";

// Anonymous client. The constellation is public-read, so anyone with the link
// watches it live — no login wall between a judge and the money shot.
export const base44 = createClient({ appId: "6a5fda5325556c5e596b9d3d" });
