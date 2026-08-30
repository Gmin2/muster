import { readFileSync, writeFileSync, existsSync } from "node:fs";

/* Writes keys into .env in place, updating any that already exist. Values are
   never printed: a refresh token read aloud in a terminal ends up pasted into a
   chat or a screenshot, and then it is burned. */
export function writeEnv(pairs) {
  const path = ".env";
  let lines = existsSync(path) ? readFileSync(path, "utf8").split("\n") : [];

  for (const [key, value] of Object.entries(pairs)) {
    if (value === undefined) continue;
    const i = lines.findIndex((l) => l.startsWith(`${key}=`));
    if (i >= 0) lines[i] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
  }

  writeFileSync(path, lines.filter((l, i) => l !== "" || i < lines.length - 1).join("\n").replace(/\n+$/, "\n"));
  return Object.keys(pairs).filter((k) => pairs[k] !== undefined);
}
