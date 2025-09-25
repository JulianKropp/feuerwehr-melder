import httpx

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "Feuerwehr-Melder/1.0 (+https://example.local)"


async def geocode_address(address: str) -> tuple[float | None, float | None]:
    """Geocode the given address using OpenStreetMap Nominatim.

    Returns (lat, lon) as floats if found, otherwise (None, None).
    """
    if not address:
        return None, None
    params = {"format": "json", "q": address}
    headers = {"User-Agent": USER_AGENT}
    async with httpx.AsyncClient(timeout=10.0, headers=headers) as client:
        try:
            resp = await client.get(NOMINATIM_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list) and data:
                lat = float(data[0]["lat"])  # type: ignore[index]
                lon = float(data[0]["lon"])  # type: ignore[index]
                return lat, lon
        except Exception:
            return None, None
    return None, None
