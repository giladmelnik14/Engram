// Shared helpers for Engram's backend functions.
// Everything in base44/shared/ is bundled into every function on deploy.

export const KINDS = [
  "decision",
  "gotcha",
  "convention",
  "architecture",
  "preference",
  "fact",
] as const;

export const RELATIONS = [
  "relates_to",
  "refines",
  "supersedes",
  "contradicts",
  "depends_on",
] as const;

export function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

/**
 * Engram has two kinds of caller and they authenticate differently.
 *
 *   - Humans on the canvas sign in with Base44 auth (Google), so `auth.me()`
 *     resolves them and RLS applies normally.
 *   - Headless clients (CLI, MCP server) have no browser and no user session.
 *     Base44 has no app-level API key, so they present a device key that lives
 *     in the app's secrets and is issued once by `engram login`.
 *
 * Returns null when neither holds, so callers can 401.
 */
export async function resolveCaller(base44: any, body: any) {
  const expected = Deno.env.get("ENGRAM_CLI_KEY");
  const presented = String(body?.device_key ?? "");

  if (expected && presented && timingSafeEqual(presented, expected)) {
    return { kind: "device", identity: String(body?.agent ?? "agent") };
  }

  const user = await base44.auth.me().catch(() => null);
  if (user) return { kind: "user", identity: user.email };

  return null;
}

/** Constant-time compare, so a wrong key cannot be recovered by timing. */
function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Find a repo by name (or id), creating it on first sight.
 * The CLI passes a bare repo name, so the first `capture` in a new
 * codebase quietly brings its constellation into existence.
 */
export async function resolveRepo(admin: any, repoRef: string | undefined) {
  const name = (repoRef ?? "").trim() || "unassigned";

  const byId = name.match(/^[a-f0-9]{24}$/i)
    ? await admin.entities.Repo.get(name).catch(() => null)
    : null;
  if (byId) return byId;

  const [existing] = await admin.entities.Repo.filter({ name }, null, 1);
  if (existing) return existing;

  return await admin.entities.Repo.create({
    name,
    description: `Auto-created on first capture`,
    memory_count: 0,
  });
}

/** Keep Repo.memory_count honest without a second round trip per read. */
export async function refreshRepoCount(admin: any, repoId: string) {
  const active = await admin.entities.Memory.filter(
    { repo_id: repoId, status: "active" },
    null,
    5000,
    0,
    ["id"],
  );
  await admin.entities.Repo.update(repoId, { memory_count: active.length });
  return active.length;
}
