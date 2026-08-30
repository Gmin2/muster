#!/usr/bin/env bash
# Refuses to let credential-shaped strings reach a commit.
#
# This exists because a real OpenAI key once ended up in .env.example, which is
# a tracked file, and was one `git push` away from a public repo. Checking by
# hand works right up until the one time you forget.
set -u

FILES=$(git diff --cached --name-only --diff-filter=ACM)
[ -z "$FILES" ] && exit 0

PATTERNS='gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{30,}|ntn_[A-Za-z0-9]{30,}|lin_api_[A-Za-z0-9]{30,}|AIza[0-9A-Za-z_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----'

FOUND=0
for f in $FILES; do
  [ -f "$f" ] || continue
  case "$f" in scripts/scan-secrets.sh) continue ;; esac
  if git show ":$f" 2>/dev/null | grep -qE "$PATTERNS"; then
    echo "  $f"
    FOUND=1
  fi
done

if [ "$FOUND" = "1" ]; then
  cat <<'MSG'

Refusing to commit: the files above look like they contain a real credential.

Move the value into .env, which is gitignored, and leave the key blank in
.env.example. If it is genuinely a false positive, commit with --no-verify.
MSG
  exit 1
fi
exit 0
