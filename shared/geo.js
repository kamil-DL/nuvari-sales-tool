import { TOWNS_GEOJSON } from './taiwan-towns.js';

// County (English name from the boundary data) -> macro-region label, matching the
// three-region + outlying-islands convention used by the map planner's REGION_ORDER
// (north/central/south/island — "east" was merged into south, see 2026-07 region taxonomy change).
const COUNTY_REGION = {
  'Taipei City': '北部', 'New Taipei City': '北部', 'Keelung City': '北部', 'Taoyuan City': '北部',
  'Hsinchu City': '北部', 'Hsinchu County': '北部', 'Yilan County': '北部',
  'Taichung City': '中部', 'Miaoli County': '中部', 'Changhua County': '中部', 'Nantou County': '中部', 'Yunlin County': '中部',
  'Tainan City': '南部', 'Kaohsiung City': '南部', 'Pingtung County': '南部', 'Chiayi City': '南部', 'Chiayi County': '南部',
  'Hualien County': '南部', 'Taitung County': '南部',
};

// Outlying islands (Penghu/Kinmen/Matsu) aren't in TOWNS_GEOJSON at all — there's no township
// polygon data for them — so they're checked by simple lat/lng bounding box before the mainland
// polygon lookup below. Boxes are generous but don't overlap mainland Taiwan's ~120–122°E range.
const ISLAND_BBOXES = [
  { county: '澎湖縣', minLat: 23.1, maxLat: 23.9, minLng: 119.2, maxLng: 119.8 },
  { county: '金門縣', minLat: 24.3, maxLat: 24.6, minLng: 118.1, maxLng: 118.6 },
  { county: '連江縣', minLat: 25.9, maxLat: 26.4, minLng: 119.9, maxLng: 120.6 },
];

function lookupIslandRegion(lat, lng) {
  const box = ISLAND_BBOXES.find(b => lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng);
  return box ? { region: '離島', county: box.county, district: null } : null;
}

function computeBBox(geometry) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  polygons.forEach(polygon => polygon.forEach(ring => ring.forEach(([lng, lat]) => {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  })));
  return { minLng, minLat, maxLng, maxLat };
}

// Precompute bounding boxes once so most of the ~367 township polygons can be
// skipped with a cheap range check before running the full ray-cast.
const TOWN_FEATURES = TOWNS_GEOJSON.features.map(feature => ({
  feature,
  bbox: computeBBox(feature.geometry),
}));

// Standard ray-casting point-in-polygon test. GeoJSON coordinates are [lng, lat].
function pointInRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInGeometry(lat, lng, geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons) {
    // First ring is the outer boundary; any further rings are holes to exclude.
    if (!pointInRing(lat, lng, polygon[0])) continue;
    let inHole = false;
    for (let h = 1; h < polygon.length; h++) {
      if (pointInRing(lat, lng, polygon[h])) { inHole = true; break; }
    }
    if (!inHole) return true;
  }
  return false;
}

// Returns { region, county, district } for a lat/lng inside Taiwan, or null if no
// township polygon contains the point (e.g. offshore islands not in this dataset, or bad coords).
export function lookupGeoFromCoords(lat, lng) {
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return null;
  const island = lookupIslandRegion(lat, lng);
  if (island) return island;
  for (const { feature, bbox } of TOWN_FEATURES) {
    if (lng < bbox.minLng || lng > bbox.maxLng || lat < bbox.minLat || lat > bbox.maxLat) continue;
    if (pointInGeometry(lat, lng, feature.geometry)) {
      const p = feature.properties;
      return {
        county: p.COUNTYNAME || null,
        district: p.TOWNNAME || null,
        region: COUNTY_REGION[p.COUNTYENG] || null,
      };
    }
  }
  return null;
}
