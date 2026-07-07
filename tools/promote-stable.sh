#!/bin/bash
# Promotes the root (Beta/dev) build into stable/ (the frozen Stable snapshot served by
# index.html's Stable cards). Run this from the repo root when you've tested the root
# build on ?env=dev and are ready to make it the new Stable baseline.
#
# stable/ mirrors the root file tree one level deeper, so relative paths (assets/,
# index.html links, CSS url()s) need an extra "../" — this script re-applies those fixes
# after copying, so it's safe to re-run any time.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf stable/map.html stable/nst stable/shared
cp map.html stable/map.html
cp -R nst stable/nst
cp -R shared stable/shared

# stable/map.html and stable/nst/*.html are one level deeper than their root counterparts.
sed -i '' \
  -e 's/src="assets\//src="..\/assets\//g' \
  -e 's/href="index\.html"/href="..\/index.html"/g' \
  -e 's/url(assets\//url(..\/assets\//g' \
  stable/map.html

for f in stable/nst/*.html; do
  sed -i '' -e 's/href="\.\.\/index\.html"/href="..\/..\/index.html"/g' "$f"
done

# stable/nst/css/nst-shared.css is 3 levels deep from repo root under stable/.
sed -i '' -e "s#url('\.\./\.\./assets/#url('../../../assets/#g" stable/nst/css/nst-shared.css

echo "stable/ updated from root. Review with 'git diff stable/' before committing."
