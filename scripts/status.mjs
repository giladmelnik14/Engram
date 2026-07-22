// Reads the constellation's current state anonymously — same view a judge
// gets by opening the public canvas.
import { createClient } from "@base44/sdk";

const base44 = createClient({ appId: "6a5fda5325556c5e596b9d3d" });

const repoFilter = process.argv[2]; // optional repo name
const repos = await base44.entities.Repo.list(null, 20);
const target = repoFilter ? repos.find((r) => r.name === repoFilter) : null;
const memories = (await base44.entities.Memory.list("-strength", 500)).filter(
  (m) => !target || m.repo_id === target.id,
);
const links = (await base44.entities.Link.list(null, 500)).filter(
  (l) => !target || l.repo_id === target.id,
);

console.log(`repos:    ${repos.map((r) => `${r.name} (${r.memory_count})`).join(", ")}`);
console.log(`memories: ${memories.length}  (${memories.filter((m) => m.status === "active").length} active, ${memories.filter((m) => m.status === "superseded").length} superseded)`);
console.log(`links:    ${links.length}\n`);

for (const m of memories) {
  const flag = m.status === "active" ? " " : "×";
  console.log(`${flag} [${(m.kind ?? "").padEnd(12)}] ${m.summary}`);
  console.log(`    strength ${(m.strength ?? 0).toFixed(2)}  recalls ${m.recall_count ?? 0}  tags: ${(m.tags ?? []).join(" ")}`);
}

console.log("");
const byId = Object.fromEntries(memories.map((m) => [m.id, m.summary]));
for (const l of links) {
  console.log(`${l.relation.padEnd(12)} ${String(byId[l.from_memory_id]).slice(0, 42)} → ${String(byId[l.to_memory_id]).slice(0, 42)}`);
}

process.exit(0);
