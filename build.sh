#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

OUT="ehentai-app.user.js"
cat \
  src/00-header.js \
  src/10-utils.js \
  src/15-idb.js \
  src/20-icons.js \
  src/30-css.js \
  src/40-http-parsers.js \
  src/60-app.js \
  src/70-list.js \
  src/75-detail.js \
  src/80-reader.js \
  src/85-reader-ui.js \
  src/90-pages.js \
  src/99-boot.js \
  > "$OUT"

node scripts/version.mjs

echo "built $OUT — $(wc -l < "$OUT" | tr -d ' ') lines, $(wc -c < "$OUT" | tr -d ' ') bytes"
