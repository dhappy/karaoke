#!/usr/bin/env bash
# Fetches Chromium's runtime shared libraries into a local prefix, for machines
# where `npx playwright install --with-deps` cannot run (no root).
# Writes CHROMIUM_LIB_PATH into .env.test.
set -euo pipefail
PREFIX="${1:-$PWD/.browser-libs}"
mkdir -p "$PREFIX" && cd "$PREFIX"
apt-get download \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libcups2 \
  libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libpango-1.0-0 libcairo2 libasound2 libxcb1 libxext6 libexpat1 \
  libglib2.0-0 libx11-6 libpangocairo-1.0-0 libpixman-1-0 libfontconfig1 \
  libfreetype6 libharfbuzz0b libgraphite2-3 libpng16-16 libxrender1 libxi6 \
  libxtst6 libwayland-client0 libwayland-server0 libxcb-randr0 libepoxy0 \
  libgtk-3-0 libgdk-pixbuf-2.0-0 >/dev/null
for d in *.deb; do dpkg-deb -x "$d" root; done
find "$PWD/root" -type d -name x86_64-linux-gnu | tr '\n' ':' \
  | sed 's|^|CHROMIUM_LIB_PATH=|' > "$OLDPWD/.env.test"
echo "wrote .env.test"
