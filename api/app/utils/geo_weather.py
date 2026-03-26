"""Geo-location and weather utilities."""

from __future__ import annotations

import httpx


async def get_weather(lat: float, lng: float) -> dict:
    """Get weather from Open-Meteo API (free, no key needed)."""
    try:
        async with httpx.AsyncClient(proxy=None) as client:
            resp = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": lat,
                    "longitude": lng,
                    "current_weather": True,
                },
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()["current_weather"]
            temp = data["temperature"]
            code = data["weathercode"]

            # WMO weather code to description + icon
            weather_map = {
                0: ("晴", "☀️"), 1: ("少云", "🌤"), 2: ("多云", "⛅"), 3: ("阴", "☁️"),
                45: ("雾", "🌫"), 48: ("雾凇", "🌫"),
                51: ("小雨", "🌦"), 53: ("中雨", "🌧"), 55: ("大雨", "🌧"),
                61: ("小雨", "🌦"), 63: ("中雨", "🌧"), 65: ("大雨", "🌧"),
                71: ("小雪", "🌨"), 73: ("中雪", "❄️"), 75: ("大雪", "❄️"),
                80: ("阵雨", "🌦"), 81: ("阵雨", "🌧"), 82: ("暴雨", "⛈"),
                95: ("雷暴", "⛈"), 96: ("冰雹", "🌨"), 99: ("冰雹", "🌨"),
            }
            desc, icon = weather_map.get(code, ("未知", "🌡"))
            weather_str = f"{desc} {temp}°C"

            return {
                "weather": weather_str,
                "weather_icon": icon,
                "temperature": temp,
            }
    except Exception:
        return {}


async def reverse_geocode(lat: float, lng: float) -> str | None:
    """Reverse geocode — try multiple providers for China compatibility."""
    # Try BigDataCloud (free, works in China)
    try:
        async with httpx.AsyncClient(proxy=None) as client:
            resp = await client.get(
                "https://api.bigdatacloud.net/data/reverse-geocode-client",
                params={
                    "latitude": lat,
                    "longitude": lng,
                    "localityLanguage": "zh",
                },
                timeout=8,
            )
            resp.raise_for_status()
            data = resp.json()
            parts = []
            city = data.get("city", "")
            locality = data.get("locality", "")
            province = data.get("principalSubdivision", "")
            if province:
                parts.append(province)
            if city and city != province:
                parts.append(city)
            if locality and locality != city:
                parts.append(locality)
            if parts:
                return " ".join(parts)
    except Exception:
        pass

    # Fallback: Nominatim (may not work in China)
    try:
        async with httpx.AsyncClient(proxy=None) as client:
            resp = await client.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={
                    "lat": lat,
                    "lon": lng,
                    "format": "json",
                    "zoom": 16,
                    "accept-language": "zh",
                },
                headers={"User-Agent": "HeadlessDiary/1.0"},
                timeout=5,
            )
            resp.raise_for_status()
            data = resp.json()
            addr = data.get("address", {})
            parts = []
            for key in ("state", "city", "district", "suburb", "road"):
                val = addr.get(key)
                if val and val not in parts:
                    parts.append(val)
            return " ".join(parts) if parts else None
    except Exception:
        return None
