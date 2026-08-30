import type { ComposeRequest, ComposeResponse } from "../lib/types";
import { digest } from "../lib/digest";
import { catalogForPrompt } from "../lib/catalog-meta";
import { systemPrompt, userPrompt } from "../lib/prompt";
import { validateLayout } from "../lib/schema";
import { fallbackLayout } from "../lib/fallback";
import { gatherServer, setRequestRepos, activeRepos, type Connections } from "./providers";
import { parseRepos } from "../lib/repos";

/* The whole pipeline runs here rather than in the browser, so the model key and
   every source token stay server side. Anything past the gather that throws
   lands on the deterministic layout, which is why the screen is never empty. */

const env = (key: string) => {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : undefined;
};

const MODEL = () => env("LLM_MODEL") ?? env("LATENT_MODEL") ?? "gpt-4o-mini";
const BASE_URL = () =>
  (env("LLM_BASE_URL") ?? env("LATENT_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/+$/, "");
const API_KEY = () => env("LLM_API_KEY") ?? env("LATENT_API_KEY") ?? env("OPENAI_API_KEY");

export function gatewayConfigured(): boolean {
  return Boolean(API_KEY());
}

export function modelName(): string {
  return gatewayConfigured() ? MODEL() : "no gateway";
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function chat(messages: ChatMessage[]): Promise<string> {
  const res = await fetch(`${BASE_URL()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL(), stream: false, messages }),
  });

  if (!res.ok) {
    throw new Error(`gateway ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content?.trim()) throw new Error("gateway returned an empty message");
  return content;
}

/* Pull the layout out of whatever the model wrapped it in: a fenced block first,
   then the outermost braces, because some gateways strip fences in transit. */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenced
    ? fenced[1]
    : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  if (!candidate.trim()) throw new Error("no json found in the reply");
  return JSON.parse(candidate);
}

async function completeLayout(system: string, user: string): Promise<unknown> {
  if (!API_KEY()) throw new Error("no model API key configured");

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const first = await chat(messages);
  try {
    return extractJson(first);
  } catch {
    // One retry with the bad reply handed back. Past that we take the fallback
    // rather than burning more latency on a model that is not complying.
    const second = await chat([
      ...messages,
      { role: "assistant", content: first },
      {
        role: "user",
        content:
          "That was not valid JSON. Reply with only one fenced json block containing the LayoutSpec, and nothing else.",
      },
    ]);
    return extractJson(second);
  }
}

export async function composeServer(
  req: ComposeRequest,
  connections?: Connections,
): Promise<ComposeResponse> {
  const start = Date.now();

  /* A repo named in the question wins over the configured default, so the
     dashboard is not permanently pinned to whatever the deployer set. */
  setRequestRepos(parseRepos(req.query));
  const repos = activeRepos();

  const { items, states } = await gatherServer(req.connected, 20, connections);

  try {
    const raw = await completeLayout(
      systemPrompt(catalogForPrompt()),
      userPrompt(req.query, digest(items), req.connected),
    );

    const { layout, dropped } = validateLayout(raw);

    return {
      ok: true,
      layout,
      meta: {
        ms: Date.now() - start,
        model: MODEL(),
        droppedPanels: dropped,
        sources: states,
        repos,
      },
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.warn("[muster] compose fell back to the deterministic layout:", error);

    return {
      ok: false,
      error,
      layout: fallbackLayout(items),
      sources: states,
      ms: Date.now() - start,
    };
  }
}
