#!/usr/bin/env python3
"""Crawl Google Places (New) for Taiwan bike shops and emit a CSV matching the
NST/map-planner unified CSV standard.

Usage:
  python3 crawl.py --county "Taipei City" --dry-run
  python3 crawl.py --county "Taipei City" --output output/taipei-pilot.csv
  python3 crawl.py --county "Taipei City" --skip-phone

Run --dry-run first to see the planned request count before spending anything.
"""
import argparse
import csv
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

import geo
from keywords import KEYWORDS, NEARBY_SEARCH_CATEGORY
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
    # extra QA columns, not part of the unified standard — importers ignore unknown columns
    "google_primary_type", "google_maps_url",
]

# Google's primaryType turned out to be a poor discriminator: it's "service"/"store" for a
# huge fraction of real bike shops AND for an equally huge tail of unrelated businesses
# (electric-scooter dealers, hardware stores, government offices, food stores...) that the
# loose keyword text-searches (esp. "電動自行車" and the "公路車"/"登山車" pair, which also
# mean "mountain climbing" and pull in every tourist POI along a scenic cycling route) sweep
# in. Checked empirically across ~14k cached results: whether the *name* contains a bike term
# is by far the strongest signal, in both directions. So that's the primary rule now, with
# primaryType=="bicycle_store" (Google's specific, deliberate classification) as a trusted
# override, and a few remaining name-based cleanups for cases a generic bike term doesn't
# catch (YouBike docks, bike-path/greenway infrastructure, motorcycle dealers with a bike
# word in a keyword-stuffed name). None of this is exhaustive — treat the output as a
# candidate list to review, same as the map planner's existing 候選店/candidate-shop
# workflow, not a final import.
BIKE_TERMS = (
    "自行車", "腳踏車", "單車", "bike", "Bike", "BIKE", "公路車", "登山車", "MTB",
    "GIANT", "捷安特", "Liv", "MERIDA", "美利達", "KHS", "功學社",
)
MOTORCYCLE_TERMS = ("機車", "摩托車", "檔車", "速克達", "重機")
MOTORCYCLE_BRANDS = ("Gogoro", "KYMCO", "SYM", "光陽", "三陽", "宏佳騰", "eReady", "PGO", "AEON")
# Public bike-share systems, not shops. Different cities brand these differently — YouBike
# (most cities), iBike (Taichung's own system, e.g. "iBike豐原大道南陽路口" — an
# intersection name, not a business) — plus the generic Chinese term some POIs use.
YOUBIKE_TERMS = (
    "YouBike", "Youbike", "youbike", "YOUBIKE", "微笑單車", "U-bike", "Ubike", "U bike",
    "iBike", "IBike", "公共自行車", "公共腳踏車", "共享單車", "MOOVO", "oBike", "OBike",
)
# "自行車道"/"腳踏車道"/"單車道" (bicycle path/lane), riverside-park greenways, practice
# tracks, parking areas, and scenic-route signage are infrastructure, not shops — but some
# real shop names also contain these characters, so only exclude when there's no shop-like
# suffix too.
INFRA_PATH_TERMS = (
    "自行車道", "腳踏車道", "單車道", "河濱公園", "練習場", "綠廊", "自行車綠廊", "鐵馬道",
    "牽引道", "停車場", "停車區", "停放區", "停車處", "公園", "廣場", "天橋", "路線看板",
    "漫遊", "起點", "步道",
)
# Deliberately "車行" not bare "行" — "行" alone is the middle character of "自行車"
# itself, so it would match every "自行車道" bike-path name and defeat this check.
SHOP_SUFFIX_TERMS = ("館", "車行", "店", "坊", "社", "工作室", "專賣", "保修站", "維修站", "車業", "工坊")
# Categorically not a retail shop regardless of what's in the name — checked empirically:
# auto_parts_store here was 100% VESPA/scooter parts dealers, parking/parking_lot and
# tourist_attraction were 100% bike-parking infra or scenic-route signage that slipped past
# the name-based infra check above, manufacturer is mostly brand HQs/factories (e.g.
# GIANT/MERIDA corporate entities) rather than a storefront worth selling to or visiting, and
# bridge/scenic_spot/rest_stop/bed_and_breakfast/lodging are cycling-tourism infrastructure or
# guesthouses. Deliberately NOT denying car_rental/finance even though those samples were all
# bike-rental businesses — rental shops are a potential customer, not noise.
HARD_DENY_TYPES = {
    "auto_parts_store", "parking", "parking_lot", "tourist_attraction", "manufacturer",
    "bridge", "scenic_spot", "rest_stop", "bed_and_breakfast", "lodging", "park",
}


def looks_like_motorcycle_dealer(name):
    if any(term in name for term in BIKE_TERMS):
        return False
    return any(term in name for term in MOTORCYCLE_TERMS + MOTORCYCLE_BRANDS)


def looks_like_infrastructure(name):
    if not any(term in name for term in INFRA_PATH_TERMS):
        return False
    return not any(term in name for term in SHOP_SUFFIX_TERMS)


def is_bikeshare_station(place):
    """True for public bike-share docks (YouBike, iBike, MOOVO, etc.) — Google's own
    primaryType is unreliable for these (often "service" instead of "bike_sharing_station"),
    so the name-based brand/generic-term check is the primary signal, same as it is for
    excluding these from is_bikeshop().
    """
    primary_type = place.get("primaryType", "")
    name = place.get("displayName", {}).get("text", "")
    return primary_type == "bike_sharing_station" or any(term in name for term in YOUBIKE_TERMS)


def is_bikeshop(place):
    """Applied before phone enrichment (to avoid paying for Place Details on shops we'll
    discard anyway) and again at CSV write time."""
    primary_type = place.get("primaryType", "")
    name = place.get("displayName", {}).get("text", "")
    if primary_type in HARD_DENY_TYPES:
        return False
    if is_bikeshare_station(place):
        return False
    if looks_like_infrastructure(name):
        return False
    if primary_type == "bicycle_store":
        return True
    if not any(term in name for term in BIKE_TERMS):
        return False
    if looks_like_motorcycle_dealer(name):
        return False
    return True


def is_operational(place):
    return place.get("businessStatus", "") == "OPERATIONAL"


def google_maps_url(place, place_id):
    loc = place.get("location", {})
    lat, lng = loc.get("latitude"), loc.get("longitude")
    if lat is None or lng is None:
        return ""
    return f"https://www.google.com/maps/search/?api=1&query={lat},{lng}&query_place_id={place_id}"

# Rough public list-price estimate for Places API (New), Basic-tier search calls
# and Contact-Data-tier details calls. Confirm current pricing in the Google
# Cloud pricing calculator before a large run — this is only a planning number.
EST_SEARCH_COST_PER_CALL = 0.032
EST_DETAILS_COST_PER_CALL = 0.017


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


def merge_place(cache, place, category_label):
    pid = place.get("id")
    if not pid:
        return
    existing = cache["places"].get(pid)
    if existing is None:
        cache["places"][pid] = {"raw": place, "category": category_label}
    elif not existing.get("category"):
        existing["category"] = category_label


def run_crawl(client, scope, grid_points, dry_run):
    cache = load_cache(scope)
    done_points = set(cache["done_points"])

    for i, point in enumerate(grid_points, 1):
        key = point_key(point)
        if key in done_points:
            continue
        label = f"[{i}/{len(grid_points)}] {point['county']}{point['district']}"
        if dry_run:
            print(f"{label}: would run 1 nearby + {len(KEYWORDS)} text searches")
            continue

        print(f"{label}: crawling...", file=sys.stderr)
        for place in client.search_nearby(point["lat"], point["lng"], point["radius_m"]):
            merge_place(cache, place, NEARBY_SEARCH_CATEGORY)

        for keyword, category_label in KEYWORDS:
            query = f"{keyword} {point['county']}{point['district']}"
            for place in client.search_text(query, point["lat"], point["lng"], point["radius_m"]):
                merge_place(cache, place, category_label)

        done_points.add(key)
        cache["done_points"] = list(done_points)
        save_cache(scope, cache)

    return cache


def enrich_phones(client, scope, cache, skip_phone):
    if skip_phone:
        return cache
    phone_done = set(cache["phone_done"])
    place_ids = [pid for pid, entry in cache["places"].items() if is_bikeshop(entry["raw"])]
    skipped = len(cache["places"]) - len(place_ids)
    if skipped:
        print(f"Skipping phone lookup for {skipped} non-bikeshop candidates", file=sys.stderr)
    for i, pid in enumerate(place_ids, 1):
        if pid in phone_done:
            continue
        entry = cache["places"][pid]
        name = entry["raw"].get("displayName", {}).get("text", pid)
        print(f"[{i}/{len(place_ids)}] phone lookup: {name}", file=sys.stderr)
        try:
            national, international = client.get_phone(pid)
        except Exception as exc:  # noqa: BLE001 - keep crawling even if one lookup fails
            print(f"  failed: {exc}", file=sys.stderr)
            national, international = None, None
        entry["phone"] = national or international
        phone_done.add(pid)
        cache["phone_done"] = list(phone_done)
        save_cache(scope, cache)
    return cache


def write_csv(cache, output_path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    skipped = 0
    with output_path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(CSV_HEADER)
        for pid, entry in cache["places"].items():
            place = entry["raw"]
            if not is_bikeshop(place) or not is_operational(place):
                skipped += 1
                continue
            primary_type = place.get("primaryType", "")
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
                primary_type,
                google_maps_url(place, pid),
            ])
            written += 1
    print(f"Wrote {written} shops to {output_path} ({skipped} filtered out as non-bikeshop or non-operational)")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--county", help="COUNTYENG filter, e.g. 'Taipei City'. Omit to crawl all of Taiwan.")
    parser.add_argument("--output", default=None, help="Output CSV path (default: output/<scope>.csv)")
    parser.add_argument("--dry-run", action="store_true", help="Only print the planned request count, no API calls.")
    parser.add_argument("--skip-phone", action="store_true", help="Skip Place Details phone-number enrichment.")
    parser.add_argument("--request-delay", type=float, default=0.1, help="Seconds to sleep between API calls.")
    parser.add_argument("--limit-points", type=int, default=None,
                         help="Only crawl the first N grid points — for smoke-testing the API key/setup cheaply.")
    args = parser.parse_args()

    scope = args.county.replace(" ", "_") if args.county else "ALL_TAIWAN"
    if args.limit_points:
        scope += f"_limit{args.limit_points}"
    grid_points = list(geo.township_grid_points(args.county))
    if not grid_points:
        print(f"No townships matched county filter {args.county!r}", file=sys.stderr)
        sys.exit(1)
    if args.limit_points:
        grid_points = grid_points[:args.limit_points]

    if args.dry_run:
        nearby_calls = len(grid_points)
        text_calls_min = len(grid_points) * len(KEYWORDS)
        text_calls_max = text_calls_min * 3  # worst case: every query paginates 3 pages
        search_calls_min = nearby_calls + text_calls_min
        search_calls_max = nearby_calls + text_calls_max
        print(f"Scope: {args.county or 'all of Taiwan'} ({len(grid_points)} townships)")
        print(f"Planned nearby-search calls: {nearby_calls}")
        print(f"Planned text-search calls: {text_calls_min}-{text_calls_max} (depends on pagination)")
        print(f"Estimated search cost: ${search_calls_min * EST_SEARCH_COST_PER_CALL:.2f}"
              f"-${search_calls_max * EST_SEARCH_COST_PER_CALL:.2f}"
              " (rough estimate only, confirm current pricing before a large run)")
        print("Phone-number Place Details cost is additional and scales with unique shops found, "
              "not with request count above — unknown until search completes.")
        run_crawl(None, scope, grid_points, dry_run=True)
        return

    load_dotenv(SCRIPT_DIR / ".env")
    api_key = os.environ.get("GOOGLE_PLACES_API_KEY")
    if not api_key:
        print("GOOGLE_PLACES_API_KEY not set — copy .env.example to .env and fill in your key.", file=sys.stderr)
        sys.exit(1)

    client = PlacesClient(api_key, request_delay=args.request_delay)
    cache = run_crawl(client, scope, grid_points, dry_run=False)
    cache = enrich_phones(client, scope, cache, args.skip_phone)

    print(f"API calls made this run: {client.stats}")
    output_path = Path(args.output) if args.output else OUTPUT_DIR / f"{scope}.csv"
    write_csv(cache, output_path)


if __name__ == "__main__":
    main()
