#!/bin/bash
set -e
COUNTIES=(
  "New Taipei City" "Keelung City" "Taoyuan City" "Hsinchu City" "Hsinchu County" "Yilan County"
  "Taichung City" "Miaoli County" "Changhua County" "Nantou County" "Yunlin County"
  "Tainan City" "Kaohsiung City" "Pingtung County" "Chiayi City" "Chiayi County"
  "Hualien County" "Taitung County" "Penghu County" "Kinmen County" "Lienchiang County"
)
for c in "${COUNTIES[@]}"; do
  echo "=== $c ==="
  .venv/bin/python crawl.py --county "$c"
done
