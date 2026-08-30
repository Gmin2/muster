import type { SourceItem } from "../lib/types";

/* Gmail and Calendar, authorised once and then held open with a refresh token.

   This is deliberately not an interactive sign-in. Google will not let an
   unverified app with Gmail scopes serve arbitrary users, and verification takes
   days, so a "sign in with Google" button would be dead for anyone who is not on
   the test-user list. Instead the owner authorises once with scripts/google-auth.mjs
   and the resulting refresh token lives in server env, exactly like the GitHub
   token. Visitors then see real mail and real events having clicked nothing. */

const env = (key: string) => {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : undefined;
};

export function googleConfigured(): boolean {
  return Boolean(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET") && env("GOOGLE_REFRESH_TOKEN"));
}

/* Access tokens last an hour. Cached in module scope so a burst of panels does
   not mint a new one per request, with a minute of slack against clock skew. */
let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID")!,
      client_secret: env("GOOGLE_CLIENT_SECRET")!,
      refresh_token: env("GOOGLE_REFRESH_TOKEN")!,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(`Google token refresh ${res.status}: ${(await res.text()).slice(0, 160)}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cached.token;
}

async function google<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
  });
  if (!res.ok) throw new Error(`Google ${res.status} on ${new URL(url).pathname}`);
  return res.json() as Promise<T>;
}

function ageDays(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

// ── Gmail ───────────────────────────────────────────────────────────────────

type GmailList = { messages?: { id: string }[] };
type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  internalDate?: string;
  snippet?: string;
  payload?: { headers?: { name: string; value: string }[] };
};

const header = (msg: GmailMessage, name: string): string =>
  msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

/* "From" arrives as `Display Name <addr@host>`, and the display name is the part
   worth showing next to a subject line. */
function sender(raw: string): string {
  const named = raw.match(/^\s*"?([^"<]+?)"?\s*</);
  if (named) return named[1].trim();
  return raw.replace(/[<>]/g, "").trim() || "unknown";
}

export async function fetchGmail(limit: number): Promise<SourceItem[]> {
  // Unread in the primary tab, which is the closest thing to "needs me".
  const list = await google<GmailList>(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(
      "is:unread category:primary",
    )}&maxResults=${limit}`,
  );

  const ids = (list.messages ?? []).slice(0, limit);

  // Metadata format only, so no message bodies are ever fetched or held.
  const messages = await Promise.all(
    ids.map((m) =>
      google<GmailMessage>(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}` +
          `?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      ).catch(() => null),
    ),
  );

  return messages.filter((m): m is GmailMessage => Boolean(m)).map((msg) => {
    const iso = msg.internalDate
      ? new Date(Number(msg.internalDate)).toISOString()
      : new Date().toISOString();
    return {
      id: `gmail-${msg.id}`,
      source: "gmail" as const,
      kind: "email" as const,
      title: header(msg, "Subject") || "(no subject)",
      url: `https://mail.google.com/mail/u/0/#inbox/${msg.threadId}`,
      state: "unread",
      author: sender(header(msg, "From")),
      updatedAt: iso,
      ageDays: ageDays(iso),
      labels: (msg.labelIds ?? []).filter((l) => !l.startsWith("CATEGORY_")).slice(0, 3),
      meta: { snippet: (msg.snippet ?? "").slice(0, 120) },
    };
  });
}

// ── Calendar ────────────────────────────────────────────────────────────────

type CalendarEvents = {
  items?: {
    id: string;
    summary?: string;
    htmlLink?: string;
    status?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    attendees?: { email: string; responseStatus?: string }[];
    organizer?: { displayName?: string; email?: string };
  }[];
};

export async function fetchCalendar(limit: number): Promise<SourceItem[]> {
  const now = new Date();
  const weekOut = new Date(now.getTime() + 7 * 86400000);

  // singleEvents expands recurring series, otherwise a weekly standup shows up
  // once with a recurrence rule instead of as the meeting that is actually next.
  const data = await google<CalendarEvents>(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
      `?timeMin=${now.toISOString()}&timeMax=${weekOut.toISOString()}` +
      `&singleEvents=true&orderBy=startTime&maxResults=${limit}`,
  );

  return (data.items ?? []).map((e) => {
    const startsAt = e.start?.dateTime ?? e.start?.date ?? now.toISOString();
    const start = new Date(startsAt);
    const hoursAway = Math.round((start.getTime() - now.getTime()) / 3600000);

    return {
      id: `calendar-${e.id}`,
      source: "calendar" as const,
      kind: "event" as const,
      title: e.summary ?? "(untitled event)",
      url: e.htmlLink,
      state: e.status ?? "confirmed",
      author: e.organizer?.displayName ?? e.organizer?.email ?? "",
      updatedAt: startsAt,
      // Calendar items are ahead of you, not behind, so age is always 0 and the
      // urgency signal is how soon it starts. The digest reads hoursAway.
      ageDays: 0,
      labels: e.start?.date ? ["all-day"] : [],
      meta: {
        hoursAway,
        attendees: e.attendees?.length ?? 0,
        startsAt,
      },
    };
  });
}
