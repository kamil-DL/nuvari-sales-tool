"""Keywords used for Places Text Search, plus a rough category label per keyword.

Google's `bicycle_store` place type (used for Nearby Search) misses shops it has
mis-categorized (e.g. filed under "store" or "hardware_store") but whose name
still matches one of these. Text-searching each keyword catches those, at the
cost of extra API calls and duplicate hits (deduped later by place id).
"""

# (query keyword, category label written to the output CSV when this keyword's
# query is what surfaced a place that Nearby Search's bicycle_store type missed)
KEYWORDS = [
    ("自行車行", "自行車行"),
    ("腳踏車店", "腳踏車行"),
    ("單車行", "單車行"),
    ("電動自行車", "電動自行車"),
    ("公路車", "公路車專賣"),
    ("登山車 MTB", "登山車專賣"),
    ("自行車維修", "自行車維修"),
    ("bike shop", "自行車行"),
]

NEARBY_SEARCH_CATEGORY = "自行車行"
