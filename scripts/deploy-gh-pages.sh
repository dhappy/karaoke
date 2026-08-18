#!/usr/bin/env bash
#
# Publishes the built site to the ROOT of the `gh-pages` branch.
#
# The branch is a build artefact, not history: each deploy replaces it with a
# single orphan commit and force-pushes. That keeps the repo from accumulating
# a parallel history of generated files, and means `gh-pages` can always be
# deleted and regenerated without losing anything.
#
# Usage:
#   scripts/deploy-gh-pages.sh              # build, verify, deploy
#   scripts/deploy-gh-pages.sh --skip-build # deploy an existing dist/
#   REMOTE=origin scripts/deploy-gh-pages.sh
set -euo pipefail

REMOTE="${REMOTE:-github}"
BRANCH="${BRANCH:-gh-pages}"
DIST="dist"

cd "$(dirname "$0")/.."

if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  echo "error: no git remote named '$REMOTE'. Set REMOTE=<name> or add one." >&2
  exit 1
fi

if [[ "${1:-}" != "--skip-build" ]]; then
  echo "==> verifying"
  pnpm lint
  pnpm check
  pnpm build
  pnpm test          # includes the Constitution II egress scan over dist/
else
  echo "==> skipping build (--skip-build)"
fi

[[ -f "$DIST/index.html" ]] || { echo "error: $DIST/index.html missing — build first." >&2; exit 1; }

# A custom domain is served from the branch root; losing CNAME silently reverts
# the site to the github.io URL, so treat its absence as a failure rather than
# discovering it after the fact.
[[ -f "$DIST/CNAME" ]] || { echo "error: $DIST/CNAME missing — public/CNAME should have been copied." >&2; exit 1; }

SHA="$(git rev-parse --short HEAD)"
SRC_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
URL="$(git remote get-url "$REMOTE")"

echo "==> publishing $DIST/ to $REMOTE/$BRANCH (from $SRC_BRANCH @ $SHA)"

# Build the commit in a scratch git dir so the working repo is never touched —
# no risk of stray index state if this fails halfway.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -R "$DIST/." "$TMP/"

git -C "$TMP" init -q -b "$BRANCH"
git -C "$TMP" config user.name  "$(git config user.name  || echo 'deploy')"
git -C "$TMP" config user.email "$(git config user.email || echo 'deploy@localhost')"
git -C "$TMP" add -A
git -C "$TMP" commit -q -m "deploy: $SRC_BRANCH @ $SHA"
git -C "$TMP" push -f "$URL" "$BRANCH"

echo "==> done. GitHub Pages will rebuild from $BRANCH shortly."
echo "    https://$(cat "$DIST/CNAME")"
