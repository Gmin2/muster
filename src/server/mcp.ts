/* A small Model Context Protocol client, Streamable HTTP transport.

   Deliberately hand written rather than pulled from the SDK: the whole surface
   we need is initialize, tools/list and tools/call, and writing it means the
   session handling and the SSE framing are visible rather than buried.

   Two details the spec requires and that are easy to miss:
   - the server may answer any POST as either JSON or an SSE stream, so both
     have to be handled on every call, not just on the ones you expect to stream
   - initialize returns an Mcp-Session-Id header that must be echoed on every
     subsequent request, or the server treats you as a new, uninitialised client */

const PROTOCOL_VERSION = "2025-06-18";

export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id?: number | string;
  result?: unknown;
  error?: { code: number; message: string };
};

/* An SSE body carries the JSON-RPC message in `data:` lines, possibly split
   across several events. We want the first frame that is a response to our
   request, so parse each data payload and return the first one with a result
   or an error. */
function parseSse(body: string): JsonRpcResponse | null {
  for (const block of body.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");
    if (!data) continue;
    try {
      const msg = JSON.parse(data) as JsonRpcResponse;
      if (msg.result !== undefined || msg.error) return msg;
    } catch {
      // a comment or a keep-alive frame, skip it
    }
  }
  return null;
}

export class McpClient {
  private sessionId: string | null = null;
  private nextId = 1;
  private ready = false;
  private tools: McpTool[] | null = null;

  /* The token may be a string, for servers that take a long lived PAT, or a
     function, for OAuth servers where the access token expires hourly and has to
     be minted from a refresh token on demand. */
  constructor(
    private readonly url: string,
    private readonly token: string | (() => Promise<string>),
    private readonly label = "mcp",
  ) {}

  private async headers(): Promise<Record<string, string>> {
    const token = typeof this.token === "function" ? await this.token() : this.token;
    const h: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      // Both, because the server picks which one it replies with.
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL_VERSION,
    };
    if (this.sessionId) h["Mcp-Session-Id"] = this.sessionId;
    return h;
  }

  private async rpc(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const res = await fetch(this.url, {
      method: "POST",
      headers: await this.headers(),
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });

    const session = res.headers.get("mcp-session-id");
    if (session) this.sessionId = session;

    if (!res.ok) {
      throw new Error(`${this.label} ${method} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
    }

    const text = await res.text();
    const contentType = res.headers.get("content-type") ?? "";
    const msg = contentType.includes("text/event-stream")
      ? parseSse(text)
      : (JSON.parse(text) as JsonRpcResponse);

    if (!msg) throw new Error(`${this.label} ${method} -> no response frame`);
    if (msg.error) throw new Error(`${this.label} ${method} -> ${msg.error.message}`);
    return msg.result;
  }

  /* A notification carries no id and gets no reply, so anything 2xx is success
     and the body is meaningless. */
  private async notify(method: string): Promise<void> {
    await fetch(this.url, {
      method: "POST",
      headers: await this.headers(),
      body: JSON.stringify({ jsonrpc: "2.0", method }),
    });
  }

  async connect(): Promise<void> {
    if (this.ready) return;
    await this.rpc("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "muster", version: "0.1.0" },
    });
    await this.notify("notifications/initialized");
    this.ready = true;
  }

  /* Memoised: resolving two tools used to cost two round trips, and the list
     cannot change inside one request. */
  async listTools(): Promise<McpTool[]> {
    if (this.tools) return this.tools;
    await this.connect();
    const result = (await this.rpc("tools/list")) as { tools?: McpTool[] };
    this.tools = result.tools ?? [];
    return this.tools;
  }

  /* Tool results come back as content blocks rather than typed data. In practice
     servers return one text block holding JSON, so try to parse it and hand back
     the raw text if it turns out to be prose after all. */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.connect();
    const result = (await this.rpc("tools/call", { name, arguments: args })) as {
      content?: { type: string; text?: string }[];
      structuredContent?: unknown;
      isError?: boolean;
    };

    if (result.isError) {
      const detail = result.content?.map((c) => c.text).join(" ") ?? "unknown";
      throw new Error(`${this.label} tool ${name} failed: ${detail.slice(0, 200)}`);
    }

    // Newer servers return typed output directly, which saves the reparse.
    if (result.structuredContent !== undefined) return result.structuredContent;

    const text = (result.content ?? [])
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text)
      .join("\n");

    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /* Servers rename tools between versions, so resolve by preference order and
     let the caller decide what to do when nothing matches. */
  async resolveTool(candidates: string[]): Promise<McpTool | null> {
    const tools = await this.listTools();
    return candidates.map((c) => tools.find((t) => t.name === c)).find(Boolean) ?? null;
  }

  /* Call a tool using its own advertised schema to decide what to send. Servers
     disagree about perPage vs per_page and reject unknown properties, so offer
     every spelling and let the schema pick. This is the point of MCP: the server
     describes itself and we adapt, rather than hardcoding one API's shape. */
  async callWithSchema(
    tool: McpTool,
    candidateArgs: Record<string, unknown>,
  ): Promise<unknown> {
    const schema = tool.inputSchema as
      | { properties?: Record<string, unknown>; required?: string[] }
      | undefined;
    const declared = schema?.properties ? Object.keys(schema.properties) : null;

    const args = declared
      ? Object.fromEntries(
          Object.entries(candidateArgs).filter(([key]) => declared.includes(key)),
        )
      : candidateArgs;

    for (const key of schema?.required ?? []) {
      if (!(key in args)) {
        throw new Error(`${this.label} tool ${tool.name} needs "${key}" and it was not supplied`);
      }
    }

    return this.callTool(tool.name, args);
  }
}
