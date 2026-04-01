export interface ZipGeoData {
  latitude: string;
  longitude: string;
  city: string;
  state: string;
  neighborhood: string | null;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupZipCode(zip: string): Promise<ZipGeoData | null> {
  try {
    const response = await fetchWithTimeout(
      `https://api.zippopotam.us/us/${zip}`,
      {},
      5000
    );
    if (!response.ok) {
      console.warn(`[zipLookup] No data found for zip ${zip} (status ${response.status})`);
      return null;
    }
    const data = await response.json() as {
      places: Array<{
        "place name": string;
        latitude: string;
        longitude: string;
        "state": string;
        "state abbreviation": string;
      }>;
    };
    const place = data.places?.[0];
    if (!place) return null;

    const latitude = place.latitude;
    const longitude = place.longitude;
    const city = place["place name"];
    const state = place["state abbreviation"];

    const neighborhood = await lookupNeighborhood(latitude, longitude);

    return { latitude, longitude, city, state, neighborhood };
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      console.warn(`[zipLookup] Timeout fetching zip data for ${zip}`);
    } else {
      console.error(`[zipLookup] Error fetching data for zip ${zip}:`, err);
    }
    return null;
  }
}

export async function reverseGeocodeNeighborhood(lat: number, lon: number): Promise<string | null> {
  return lookupNeighborhood(String(lat), String(lon));
}

async function lookupNeighborhood(lat: string, lon: string): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent": "PhoneChatService/1.0",
          "Accept-Language": "en",
        },
      },
      4000
    );
    if (!response.ok) return null;
    const data = await response.json() as {
      address?: {
        neighbourhood?: string;
        suburb?: string;
        quarter?: string;
        hamlet?: string;
        village?: string;
      };
    };
    const addr = data.address;
    if (!addr) return null;
    return addr.neighbourhood ?? addr.suburb ?? addr.quarter ?? addr.hamlet ?? addr.village ?? null;
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      console.warn(`[zipLookup] Timeout on Nominatim lookup for ${lat},${lon}`);
    } else {
      console.warn(`[zipLookup] Nominatim lookup failed for ${lat},${lon}:`, err);
    }
    return null;
  }
}
