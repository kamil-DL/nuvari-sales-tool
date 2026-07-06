// Canonical macro-region colors, originally defined as the `REGIONS` object in
// map-v0.4.1.html. Keyed by internal slug (matching the map's REGION_ORDER) and by the
// Chinese label (matching what's actually stored in shops.region in the Shop DB) — both
// need to stay in sync with map.html's own REGIONS object, which is a classic
// (non-module) script and keeps its own copy rather than importing this dynamically.
//
// 2026-07 region taxonomy change: "east" (東部) was merged into "south" (Hualien/Taitung
// now count as south); outlying islands (Penghu/Kinmen/Matsu) got their own "island" (離島)
// region instead of being uncategorized.
export const REGION_ZH_BY_SLUG = { north: '北部', central: '中部', south: '南部', island: '離島' };

export const REGION_COLOR_BY_SLUG = {
  north: '#3B6FD9',
  central: '#E08E2C',
  south: '#1FA67A',
  island: '#8B5CF6',
};

export const REGION_COLOR_BY_ZH = Object.fromEntries(
  Object.entries(REGION_ZH_BY_SLUG).map(([slug, zh]) => [zh, REGION_COLOR_BY_SLUG[slug]])
);
