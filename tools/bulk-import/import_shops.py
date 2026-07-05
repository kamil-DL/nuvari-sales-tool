#!/usr/bin/env python3
"""One-off bulk importer: loads the crawler's CSV datasets into production Shop DB.

Usage:
  python3 import_shops.py            # imports all 4 datasets
  python3 import_shops.py GIANT      # imports only the named dataset
"""
import csv
import os
import sys

import requests
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
CREATED_BY = "833b978d-e782-4d6a-abb0-2b5e71c7a1e3"  # kamil.wysocki@datalake-tech.com

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

BATCH_SIZE = 500

CRAWLER_OUTPUT = os.path.join(os.path.dirname(__file__), "..", "taiwan-bikeshop-crawler", "output")

DATASETS = [
    (os.path.join(CRAWLER_OUTPUT, "ALL_TAIWAN_bikeshops.csv"), "Taiwan Bike Shops"),
    (os.path.join(CRAWLER_OUTPUT, "chain_全國電子.csv"), "全國電子"),
    (os.path.join(CRAWLER_OUTPUT, "GIANT_shops.csv"), "GIANT"),
    (os.path.join(CRAWLER_OUTPUT, "MERIDA_shops.csv"), "MERIDA"),
]


def get_or_create_dataset(name):
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/shop_datasets",
        headers=HEADERS,
        params={"name": f"eq.{name}", "select": "id"},
    )
    r.raise_for_status()
    rows = r.json()
    if rows:
        return rows[0]["id"]
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/shop_datasets",
        headers={**HEADERS, "Prefer": "return=representation"},
        json={"name": name, "created_by": CREATED_BY},
    )
    r.raise_for_status()
    return r.json()[0]["id"]


def to_float(v):
    return float(v) if v not in (None, "") else None


def to_int(v):
    return int(float(v)) if v not in (None, "") else None


def row_to_shop(row, dataset_id):
    return {
        "name": row["name"],
        "address": row.get("address") or None,
        "lat": to_float(row.get("lat")),
        "lng": to_float(row.get("lng")),
        "status": row.get("status") or "尚未開發",
        "contact_name": row.get("contact_name") or None,
        "contact_phone": row.get("contact_phone") or None,
        "notes": row.get("notes") or None,
        "region": row.get("地區") or None,
        "county": row.get("縣市") or None,
        "district": row.get("鄉鎮市區") or None,
        "coord_status": row.get("座標狀態") or None,
        "google_name": row.get("google_name") or None,
        "google_address": row.get("google_address") or None,
        "google_place_id": row.get("google_place_id") or None,
        "google_rating": to_float(row.get("google_rating")),
        "google_rating_count": to_int(row.get("google_rating_count")),
        "business_status": row.get("business_status") or None,
        "category": row.get("category") or None,
        "dataset_id": dataset_id,
        "created_by": CREATED_BY,
    }


def import_csv(path, dataset_name):
    dataset_id = get_or_create_dataset(dataset_name)
    with open(path, encoding="utf-8-sig") as f:
        rows = [row_to_shop(row, dataset_id) for row in csv.DictReader(f)]

    print(f"{dataset_name}: {len(rows)} rows to insert (dataset_id={dataset_id})")
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/shops",
            headers={**HEADERS, "Prefer": "return=minimal"},
            json=batch,
        )
        if not r.ok:
            print(f"  batch {i}-{i + len(batch)} FAILED: {r.status_code} {r.text[:500]}")
            sys.exit(1)
        print(f"  inserted {i + len(batch)}/{len(rows)}")
    print(f"{dataset_name}: done.\n")


if __name__ == "__main__":
    only = sys.argv[1] if len(sys.argv) > 1 else None
    targets = [(p, n) for p, n in DATASETS if not only or n == only]
    if not targets:
        print(f"No dataset named {only!r}. Options: {[n for _, n in DATASETS]}")
        sys.exit(1)
    for path, name in targets:
        import_csv(path, name)
