import type { SourceAdapter } from "./types";
import { githubAdapter } from "./github";
import { linearAdapter, notionAdapter, gmailAdapter, calendarAdapter } from "./fixtures";
import type { SourceId } from "../types";

export const SOURCES: Record<SourceId, SourceAdapter> = {
  github: githubAdapter,
  linear: linearAdapter,
  notion: notionAdapter,
  gmail: gmailAdapter,
  calendar: calendarAdapter,
};

export { gather } from "./types";
