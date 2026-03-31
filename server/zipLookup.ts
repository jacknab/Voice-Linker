export interface ZipGeoData {
  latitude: string;
  longitude: string;
  city: string;
  state: string;
  neighborhood: string | null;
}

export async function lookupZipCode(zip: string): Promise<ZipGeoData | null> {
  try {
    const response = await fetch(`https://api.zippopotam.us/us/${zip}`);
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

    // Use Nominatim reverse geocoding to get a neighbourhood-level name
    const neighborhood = await lookupNeighborhood(latitude, longitude);

    return { latitude, longitude, city, state, neighborhood };
  } catch (err) {
    console.error(`[zipLookup] Error fetching data for zip ${zip}:`, err);
    return null;
  }
}

export async function reverseGeocodeNeighborhood(lat: number, lon: number): Promise<string | null> {
  return lookupNeighborhood(String(lat), String(lon));
}

async function lookupNeighborhood(lat: string, lon: string): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "PhoneChatService/1.0",
        "Accept-Language": "en",
      },
    });
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
    // Prefer the most granular name available
    return addr.neighbourhood ?? addr.suburb ?? addr.quarter ?? addr.hamlet ?? addr.village ?? null;
  } catch (err) {
    console.warn(`[zipLookup] Nominatim lookup failed for ${lat},${lon}:`, err);
    return null;
  }
}
