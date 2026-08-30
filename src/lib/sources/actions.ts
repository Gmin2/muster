import type { ActionResult, WriteAction } from "../types";

/* Writes go through our own server so the token stays out of the bundle. The
   allowlist and the real call live in src/server/actions.ts. */
export async function executeAction(action: WriteAction): Promise<ActionResult> {
  try {
    const res = await fetch("/api/act", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
    if (!res.ok) throw new Error(`act endpoint returned ${res.status}`);
    return (await res.json()) as ActionResult;
  } catch (err) {
    return {
      ok: false,
      applied: `Could not reach the write endpoint: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
