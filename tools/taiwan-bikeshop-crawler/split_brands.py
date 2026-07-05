#!/usr/bin/env python3
"""Split the merged Taiwan bike-shop CSV into per-brand subsets by name match.

A shop carrying both brands (common for multi-brand dealers) appears in both
output files — this isn't a partition, just two overlapping filtered views.
"""
import csv
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
INPUT_PATH = SCRIPT_DIR / "output" / "ALL_TAIWAN_bikeshops.csv"

BRANDS = {
    "GIANT": ("GIANT", "捷安特", "Liv"),
    "MERIDA": ("MERIDA", "美利達"),
}


def main():
    with INPUT_PATH.open(encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    for brand, terms in BRANDS.items():
        matches = [r for r in rows if any(t in r["name"] for t in terms)]
        output_path = SCRIPT_DIR / "output" / f"{brand}_shops.csv"
        with output_path.open("w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(matches)
        print(f"{brand}: {len(matches)} shops -> {output_path}")


if __name__ == "__main__":
    main()
