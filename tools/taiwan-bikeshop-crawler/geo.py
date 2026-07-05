"""Township polygon lookup, ported from nst/js/geo.js so the crawler assigns
region/county/district the same way the rest of the app does, without paying
Google for reverse geocoding.
"""
import json
import re
from functools import lru_cache
from pathlib import Path

TOWNS_JS_PATH = Path(__file__).resolve().parent.parent.parent / "shared" / "taiwan-towns.js"

# Mirrors COUNTY_REGION in nst/js/geo.js
COUNTY_REGION = {
    "Taipei City": "北部", "New Taipei City": "北部", "Keelung City": "北部", "Taoyuan City": "北部",
    "Hsinchu City": "北部", "Hsinchu County": "北部", "Yilan County": "北部",
    "Taichung City": "中部", "Miaoli County": "中部", "Changhua County": "中部", "Nantou County": "中部", "Yunlin County": "中部",
    "Tainan City": "南部", "Kaohsiung City": "南部", "Pingtung County": "南部", "Chiayi City": "南部", "Chiayi County": "南部",
    "Hualien County": "東部", "Taitung County": "東部",
}


@lru_cache(maxsize=1)
def load_towns_geojson():
    text = TOWNS_JS_PATH.read_text(encoding="utf-8")
    match = re.search(r"export const TOWNS_GEOJSON = (\{.*\});", text, re.S)
    if not match:
        raise ValueError(f"Could not find TOWNS_GEOJSON export in {TOWNS_JS_PATH}")
    return json.loads(match.group(1))


def _bbox(geometry):
    polygons = geometry["coordinates"] if geometry["type"] == "Polygon" else geometry["coordinates"]
    rings = polygons if geometry["type"] == "Polygon" else [ring for poly in polygons for ring in poly]
    min_lng = min_lat = float("inf")
    max_lng = max_lat = float("-inf")
    for ring in rings:
        for lng, lat in ring:
            min_lng, max_lng = min(min_lng, lng), max(max_lng, lng)
            min_lat, max_lat = min(min_lat, lat), max(max_lat, lat)
    return min_lng, min_lat, max_lng, max_lat


def _point_in_ring(lat, lng, ring):
    inside = False
    j = len(ring) - 1
    for i, (xi, yi) in enumerate(ring):
        xj, yj = ring[j]
        if ((yi > lat) != (yj > lat)) and (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def _point_in_geometry(lat, lng, geometry):
    polygons = geometry["coordinates"] if geometry["type"] == "Polygon" else geometry["coordinates"]
    polygons = [polygons] if geometry["type"] == "Polygon" else polygons
    for polygon in polygons:
        if not _point_in_ring(lat, lng, polygon[0]):
            continue
        if any(_point_in_ring(lat, lng, polygon[h]) for h in range(1, len(polygon))):
            continue
        return True
    return False


@lru_cache(maxsize=1)
def _indexed_features():
    geojson = load_towns_geojson()
    out = []
    for feature in geojson["features"]:
        out.append((feature, _bbox(feature["geometry"])))
    return out


def lookup_geo_from_coords(lat, lng):
    """Returns dict(region, county, district) for a lat/lng inside Taiwan, or None."""
    if lat is None or lng is None:
        return None
    for feature, (min_lng, min_lat, max_lng, max_lat) in _indexed_features():
        if lng < min_lng or lng > max_lng or lat < min_lat or lat > max_lat:
            continue
        if _point_in_geometry(lat, lng, feature["geometry"]):
            p = feature["properties"]
            return {
                "county": p.get("COUNTYNAME"),
                "district": p.get("TOWNNAME"),
                "region": COUNTY_REGION.get(p.get("COUNTYENG")),
            }
    return None


def township_grid_points(county_eng_filter=None):
    """Yields (county_name, district_name, centroid_lat, centroid_lng, radius_m) per
    township, sized from its bounding box, for use as Nearby/Text search grid points.
    """
    for feature, (min_lng, min_lat, max_lng, max_lat) in _indexed_features():
        p = feature["properties"]
        if county_eng_filter and p.get("COUNTYENG") != county_eng_filter:
            continue
        centroid_lat = (min_lat + max_lat) / 2
        centroid_lng = (min_lng + max_lng) / 2
        # Rough meters-per-degree at Taiwan's latitude, used only to size the search
        # radius generously enough to cover the township's bounding box from its center.
        lat_span_m = (max_lat - min_lat) * 111_000
        lng_span_m = (max_lng - min_lng) * 101_000
        radius_m = max(1200, min(50_000, (lat_span_m ** 2 + lng_span_m ** 2) ** 0.5 / 2))
        yield {
            "county": p.get("COUNTYNAME"),
            "county_eng": p.get("COUNTYENG"),
            "district": p.get("TOWNNAME"),
            "lat": centroid_lat,
            "lng": centroid_lng,
            "radius_m": radius_m,
        }
