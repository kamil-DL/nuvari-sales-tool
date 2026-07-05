#!/usr/bin/env python3
"""Crawl Google Places (New) nationwide for a specific chain name (e.g. 全國電子),
reusing the same township grid as crawl.py but with a single text-search query
per grid point instead of the bike-shop nearby+keyword set.

Usage:
  python3 crawl_chain.py --query "全國電子" --dry-run
  python3 crawl_chain.py --query "全國電子" --output output/quanguo_dianzi.csv
"""
import argparse
import csv
import json
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

import geo
from places_client import PlacesClient

SCRIPT_DIR = Path(__file__).resolve().parent
CACHE_DIR = SCRIPT_DIR / ".crawl-cache"
OUTPUT_DIR = SCRIPT_DIR / "output"

CSV_HEADER = [
    "name", "status", "category", "address", "縣市", "鄉鎮市區", "地區",
    "lat", "lng", "座標狀態",
    "google_name", "google_address", "google_place_id",
    "google_rating", "google_rating_count", "business_status",
    "contact_name", "contact_phone", "notes",
    "google_primary_type",
]

EST_SEARCH_COST_PER_CALL = 0.032
EST_DETAILS_COST_PER_CALL = 0.017


def chain_scope(query):
    return "chain_" + re.sub(r"[^\w一-鿿]+", "_", query)


def cache_path(scope):
    CACHE_DIR.mkdir(exist_ok=True)
    return CACHE_DIR / f"{scope}.json"


def load_cache(scope):
    path = cache_path(scope)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"done_points": [], "places": {}, "phone_done": []}


def save_cache(scope, cache):
    path = cache_path(scope)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def point_key(point):
    return f"{point['county_eng']}::{point['district']}"


def run_crawl(client, scope, query, grid_points, dry_run):
    cache = load_cache(scope)
    done_points = set(cache["done_points"])

    for i, point in enumerate(grid_points, 1):
        key = point_key(point)
        if key in done_points:
            continue
        label = f"[{i}/{len(grid_points)}] {point['county']}{point['district']}"
        if dry_run:
            print(f"{label}: would run 1 text search")
            continue

        print(f"{label}: crawling...", file=sys.stderr)
        text_query = f"{query} {point['county']}{point['district']}"
        for place in client.search_text(text_query, point["lat"], point["lng"], point["radius_m"]):
            pid = place.get("id")
            name = place.get("displayName", {}).get("text", "")
            # Text Search does fuzzy/proximity matching, not strict substring — it happily
            # returns nearby competitors (e.g. 燦坤3C) or loosely-related businesses. Since
            # this script targets one specific chain, require the exact name to appear.
            if pid and query in name and pid not in cache["places"]:
                cache["places"][pid] = {"raw": place}

        done_points.add(key)
        cache["done_points"] = list(done_points)
        save_cache(scope, cache)

    return cache


def enrich_phones(client, scope, cache, skip_phone):
    if skip_phone:
        return cache
    phone_done = set(cache["phone_done"])
    place_ids = list(cache["places"].keys())
    for i, pid in enumerate(place_ids, 1):
        if pid in phone_done:
            continue
        entry = cache["places"][pid]
        name = entry["raw"].get("displayName", {}).get("text", pid)
        print(f"[{i}/{len(place_ids)}] phone lookup: {name}", file=sys.stderr)
        try:
            national, international = client.get_phone(pid)
        except Exception as exc:  # noqa: BLE001
            print(f"  failed: {exc}", file=sys.stderr)
            national, international = None, None
        entry["phone"] = national or international
        phone_done.add(pid)
        cache["phone_done"] = list(phone_done)
        save_cache(scope, cache)
    return cache


def write_csv(cache, query, category_label, output_path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    with output_path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(CSV_HEADER)
        for pid, entry in cache["places"].items():
            place = entry["raw"]
            name = place.get("displayName", {}).get("text", "")
            loc = place.get("location", {})
            lat, lng = loc.get("latitude"), loc.get("longitude")
            geo_info = geo.lookup_geo_from_coords(lat, lng) or {}
            writer.writerow([
                name,
                "尚未開發",
                category_label,
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
                f"Imported from Google Places chain crawl ({query})",
                place.get("primaryType", ""),
            ])
            written += 1
    print(f"Wrote {written} locations to {output_path}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--query", required=True, help="Chain name to search for, e.g. '全國電子'")
    parser.add_argument("--category", default=None, help="Category label written to CSV (default: same as --query)")
    parser.add_argument("--county", help="COUNTYENG filter. Omit to crawl all of Taiwan.")
    parser.add_argument("--output", default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-phone", action="store_true")
    parser.add_argument("--request-delay", type=float, default=0.1)
    parser.add_argument("--limit-points", type=int, default=None)
    args = parser.parse_args()

    scope = chain_scope(args.query)
    if args.county:
        scope += "_" + args.county.replace(" ", "_")
    grid_points = list(geo.township_grid_points(args.county))
    if args.limit_points:
        grid_points = grid_points[:args.limit_points]

    if args.dry_run:
        print(f"Query: {args.query!r}, scope: {args.county or 'all of Taiwan'} ({len(grid_points)} townships)")
        print(f"Planned text-search calls: {len(grid_points)}-{len(grid_points) * 3} (depends on pagination)")
        print(f"Estimated search cost: ${len(grid_points) * EST_SEARCH_COST_PER_CALL:.2f}"
              f"-${len(grid_points) * 3 * EST_SEARCH_COST_PER_CALL:.2f} (rough estimate only)")
        return

    load_dotenv(SCRIPT_DIR / ".env")
    api_key = os.environ.get("GOOGLE_PLACES_API_KEY")
    if not api_key:
        print("GOOGLE_PLACES_API_KEY not set.", file=sys.stderr)
        sys.exit(1)

    client = PlacesClient(api_key, request_delay=args.request_delay)
    cache = run_crawl(client, scope, args.query, grid_points, dry_run=False)
    cache = enrich_phones(client, scope, cache, args.skip_phone)

    print(f"API calls made this run: {client.stats}")
    output_path = Path(args.output) if args.output else OUTPUT_DIR / f"{scope}.csv"
    write_csv(cache, args.query, args.category or args.query, output_path)


if __name__ == "__main__":
    main()
