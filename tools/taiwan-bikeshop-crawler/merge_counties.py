#!/usr/bin/env python3
"""Merge all per-county .crawl-cache/*.json files into nationwide CSVs.

Two outputs:
  output/ALL_TAIWAN_bikeshops.csv — same filtering as crawl.py's per-county CSV
  output/ALL_TAIWAN_youbike.csv   — bike_sharing_station entries, incidentally
                                     captured by the same searches, that the
                                     bikeshop CSV discards

Dedupes by place_id across all counties (border townships can get the same
place from two counties' grid points).
"""
import csv
import json
import sys
from pathlib import Path

import geo
from crawl import CACHE_DIR, CSV_HEADER, OUTPUT_DIR, is_bikeshop

YOUBIKE_HEADER = [
    "name", "address", "縣市", "鄉鎮市區", "地區", "lat", "lng",
    "google_place_id", "google_primary_type",
]


def load_all_places():
    merged = {}
    for path in sorted(CACHE_DIR.glob("*.json")):
        if "_limit" in path.stem:
            continue  # skip smoke-test caches
        cache = json.loads(path.read_text(encoding="utf-8"))
        for pid, entry in cache.get("places", {}).items():
            if pid not in merged:
                merged[pid] = entry
    return merged


def write_bikeshops(places, output_path):
    written = 0
    with output_path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(CSV_HEADER)
        for pid, entry in places.items():
            place = entry["raw"]
            if not is_bikeshop(place):
                continue
            name = place.get("displayName", {}).get("text", "")
            loc = place.get("location", {})
            lat, lng = loc.get("latitude"), loc.get("longitude")
            geo_info = geo.lookup_geo_from_coords(lat, lng) or {}
            writer.writerow([
                name,
                "尚未開發",
                entry.get("category") or "",
                place.get("formattedAddress", ""),
                geo_info.get("county") or "",
                geo_info.get("district") or "",
                geo_info.get("region") or "",
                lat if lat is not None else "",
                lng if lng is not None else "",
                "Google Places",
                name,
                place.get("formattedAddress", ""),
                pid,
                place.get("rating", ""),
                place.get("userRatingCount", ""),
                place.get("businessStatus", ""),
                "",
                entry.get("phone") or "",
                "Imported from Google Places crawl",
                place.get("primaryType", ""),
            ])
            written += 1
    print(f"Wrote {written} bike shops to {output_path}")


def write_youbike(places, output_path):
    written = 0
    with output_path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(YOUBIKE_HEADER)
        for pid, entry in places.items():
            place = entry["raw"]
            if place.get("primaryType") != "bike_sharing_station":
                continue
            name = place.get("displayName", {}).get("text", "")
            loc = place.get("location", {})
            lat, lng = loc.get("latitude"), loc.get("longitude")
            geo_info = geo.lookup_geo_from_coords(lat, lng) or {}
            writer.writerow([
                name,
                place.get("formattedAddress", ""),
                geo_info.get("county") or "",
                geo_info.get("district") or "",
                geo_info.get("region") or "",
                lat if lat is not None else "",
                lng if lng is not None else "",
                pid,
                place.get("primaryType", ""),
            ])
            written += 1
    print(f"Wrote {written} YouBike stations to {output_path}")


def main():
    OUTPUT_DIR.mkdir(exist_ok=True)
    places = load_all_places()
    print(f"Loaded {len(places)} unique places across all cached counties", file=sys.stderr)
    write_bikeshops(places, OUTPUT_DIR / "ALL_TAIWAN_bikeshops.csv")
    write_youbike(places, OUTPUT_DIR / "ALL_TAIWAN_youbike.csv")


if __name__ == "__main__":
    main()
