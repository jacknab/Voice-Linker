export interface ZipGeoData {
  latitude: string;
  longitude: string;
  city: string;
  state: string;
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
    return {
      latitude: place.latitude,
      longitude: place.longitude,
      city: place["place name"],
      state: place["state abbreviation"],
    };
  } catch (err) {
    console.error(`[zipLookup] Error fetching data for zip ${zip}:`, err);
    return null;
  }
}
