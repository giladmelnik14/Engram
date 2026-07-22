import { createClient } from "@base44/sdk";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
const auth = JSON.parse(await readFile(join(homedir(),".base44","auth","auth.json"),"utf8"));
console.log("token present:", !!auth.accessToken, "len:", auth.accessToken?.length);
console.log("expiresAt:", auth.expiresAt, "now:", Date.now(), "expired:", Number(auth.expiresAt) < Date.now());
const b = createClient({ appId: "6a5fda5325556c5e596b9d3d", token: auth.accessToken });
try { const me = await b.auth.me(); console.log("me():", JSON.stringify(me)?.slice(0,200)); }
catch(e){ console.log("me() FAIL:", e?.response?.data?.message ?? e.message); }
try { const u = await b.entities.User.list(null,2); console.log("User.list OK:", u.length); }
catch(e){ console.log("User.list FAIL:", e?.response?.data?.message ?? e.message); }
process.exit(0);
