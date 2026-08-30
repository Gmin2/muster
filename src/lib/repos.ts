/* Pull repository names out of whatever the user typed.

   The command bar is already a natural language input, so "what is happening in
   vercel/next.js" should just work rather than needing a second control. That
   also removes the last place the app was pinned to one person's data: env
   supplies the default, the question overrides it. */

// Words that show up as owner/name but never mean a repository.
const NOT_REPOS = new Set([
  "and", "or", "a", "an", "the", "him", "her", "and/or", "input", "output",
  "yes", "no", "on", "off", "read", "write", "n", "y", "s", "km", "am", "pm",
]);

/* A github.com URL is matched and removed first. Otherwise the trailing path of
   ".../pull/4" gets read as a second repository called "pull/4". */
const URL_PATTERN =
  /(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9][\w.-]{0,38})\/([A-Za-z0-9][\w.-]{0,99})[^\s]*/g;

const REPO_PATTERN = /\b([A-Za-z0-9][\w.-]{0,38})\/([A-Za-z0-9][\w.-]{0,99})\b/g;

export function parseRepos(query: string): string[] {
  const found: string[] = [];

  let rest = query;
  for (const match of query.matchAll(URL_PATTERN)) {
    const slug = `${match[1]}/${match[2].replace(/[.,;:!?)\]]+$/, "")}`;
    if (!found.includes(slug)) found.push(slug);
    rest = rest.replace(match[0], " ");
  }

  for (const match of rest.matchAll(REPO_PATTERN)) {
    const owner = match[1];
    // Trailing punctuation and URL tails like /pull/4 are not part of the name.
    const name = match[2].replace(/[.,;:!?)\]]+$/, "").split("/")[0];

    if (!owner || !name) continue;
    if (NOT_REPOS.has(owner.toLowerCase()) || NOT_REPOS.has(name.toLowerCase())) continue;
    // A bare "3/4" or a date fragment is not a repository.
    if (/^\d+$/.test(owner) && /^\d+$/.test(name)) continue;

    const slug = `${owner}/${name}`;
    if (!found.includes(slug)) found.push(slug);
  }

  // More than a couple means the question was probably about something else,
  // and each repo costs real round trips.
  return found.slice(0, 3);
}
