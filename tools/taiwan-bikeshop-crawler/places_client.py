"""Thin client for the Places API (New) — searchNearby, searchText, and the
single-field Place Details call used for phone-number enrichment.

Field masks are kept to the minimum needed (Basic-tier search fields; Contact
Data's phone fields only on the details call) to avoid pulling in
Atmosphere/Pro-tier fields we don't need and don't want to pay for.
"""
import time

import requests

BASE_URL = "https://places.googleapis.com/v1"

PLACE_FIELDS = (
    "places.id,places.displayName,places.formattedAddress,places.location,"
    "places.rating,places.userRatingCount,places.businessStatus,places.primaryType"
)
# searchNearby's response has no nextPageToken field at all (it doesn't paginate);
# only searchText does, so the two endpoints need different field masks.
SEARCH_FIELDS_NEARBY = PLACE_FIELDS
SEARCH_FIELDS_TEXT = PLACE_FIELDS + ",nextPageToken"
DETAILS_FIELDS = "nationalPhoneNumber,internationalPhoneNumber"

MAX_TEXT_SEARCH_PAGES = 3
RETRYABLE_STATUS = {429, 500, 502, 503}


class PlacesClient:
    def __init__(self, api_key, request_delay=0.1, max_retries=4):
        self.api_key = api_key
        self.request_delay = request_delay
        self.max_retries = max_retries
        self.session = requests.Session()
        self.stats = {"nearby_calls": 0, "text_calls": 0, "details_calls": 0}

    def _post(self, path, body, field_mask):
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": field_mask,
        }
        return self._with_retries(
            lambda: self.session.post(f"{BASE_URL}/{path}", json=body, headers=headers, timeout=20)
        )

    def _get(self, path, field_mask):
        headers = {"X-Goog-Api-Key": self.api_key, "X-Goog-FieldMask": field_mask}
        return self._with_retries(
            lambda: self.session.get(f"{BASE_URL}/{path}", headers=headers, timeout=20)
        )

    def _with_retries(self, do_request):
        last_exc = None
        for attempt in range(self.max_retries):
            time.sleep(self.request_delay)
            try:
                resp = do_request()
            except requests.RequestException as exc:
                last_exc = exc
                time.sleep(2 ** attempt)
                continue
            if resp.status_code in RETRYABLE_STATUS:
                time.sleep(2 ** attempt)
                continue
            if not resp.ok:
                raise requests.HTTPError(f"{resp.status_code} {resp.reason} for {resp.url}: {resp.text}", response=resp)
            return resp.json()
        if last_exc:
            raise last_exc
        resp.raise_for_status()
        return resp.json()

    def search_nearby(self, lat, lng, radius_m, included_types=("bicycle_store",)):
        self.stats["nearby_calls"] += 1
        body = {
            "includedTypes": list(included_types),
            "maxResultCount": 20,
            "locationRestriction": {
                "circle": {"center": {"latitude": lat, "longitude": lng}, "radius": min(radius_m, 50_000)}
            },
            "languageCode": "zh-TW",
            "regionCode": "TW",
        }
        data = self._post("places:searchNearby", body, SEARCH_FIELDS_NEARBY)
        return data.get("places", [])

    def search_text(self, query, lat, lng, radius_m):
        results = []
        page_token = None
        for _ in range(MAX_TEXT_SEARCH_PAGES):
            body = {
                "textQuery": query,
                "maxResultCount": 20,
                "locationBias": {
                    "circle": {"center": {"latitude": lat, "longitude": lng}, "radius": min(radius_m, 50_000)}
                },
                "languageCode": "zh-TW",
                "regionCode": "TW",
            }
            if page_token:
                body["pageToken"] = page_token
            self.stats["text_calls"] += 1
            data = self._post("places:searchText", body, SEARCH_FIELDS_TEXT)
            results.extend(data.get("places", []))
            page_token = data.get("nextPageToken")
            if not page_token:
                break
            time.sleep(2)  # next_page_token needs a moment to become valid
        return results

    def get_phone(self, place_id):
        self.stats["details_calls"] += 1
        name = place_id if place_id.startswith("places/") else f"places/{place_id}"
        data = self._get(name, DETAILS_FIELDS)
        return data.get("nationalPhoneNumber"), data.get("internationalPhoneNumber")
