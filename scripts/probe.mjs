// Health probe: confirms the deployed entities are reachable from an *external*
// Node process with no Base44 frontend involved — which is the whole thesis.
import { createClient } from "@base44/sdk";

const base44 = createClient({ appId: "6a5fda5325556c5e596b9d3d" });

for (const name of ["Memory", "Link", "Repo", "Session", "User"]) {
  try {
    const rows = await base44.entities[name].list(null, 1);
    console.log(`OK   ${name.padEnd(8)} reachable, ${rows.length} row(s)`);
  } catch (e) {
    const detail = e?.response?.data ? JSON.stringify(e.response.data) : e?.message;
    console.log(`FAIL ${name.padEnd(8)} ${detail}`);
  }
}

// The SDK keeps a live connection open, so the process will not exit on its own.
process.exit(0);
