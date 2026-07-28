import { activeAutomaticStations } from "../api/weather.ts";
import type { Station } from "../domain/models.ts";
import { distanceKm } from "./geo.ts";
import { fail } from "./error.ts";

export type ResolvedLocation = { label: string; latitude: number; longitude: number; elevationM?: number; source: "coordinates" | "geocoder" };
export type SelectedStation = { station: Station; distanceKm: number; score: number; rationale: string[] };
const DEFAULT_GEOCODER = "https://nominatim.openstreetmap.org/search";

export function parseNear(value: string): ResolvedLocation {
  const [latitude, longitude, ...extra] = value.split(",").map(Number);
  if (extra.length || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude!) > 90 || Math.abs(longitude!) > 180) fail("INVALID_LOCATION", "--near must be latitude,longitude.");
  return { label: value, latitude: latitude!, longitude: longitude!, source: "coordinates" };
}

/**
 * Nominatim gives the CLI a no-key, country-restricted default.  An official
 * address endpoint can be selected with VEDUR_GEOCODER_URL without a release.
 * We accept ordinary GeoJSON FeatureCollections and ArcGIS query responses.
 * Results are deliberately not persisted: an address is personal location data.
 */
export async function geocode(query: string): Promise<ResolvedLocation> {
  const endpoint = process.env.VEDUR_GEOCODER_URL || DEFAULT_GEOCODER;
  const url = new URL(endpoint);
  url.searchParams.set("q", query);
  url.searchParams.set("f", "geojson");
  if (endpoint === DEFAULT_GEOCODER) {
    url.searchParams.set("format", "geojson");
    url.searchParams.set("countrycodes", "is");
    url.searchParams.set("limit", "5");
    url.searchParams.set("addressdetails", "1");
  } else url.searchParams.set("query", query);
  let payload: unknown;
  try {
    const response = await fetch(url, { headers: { Accept: "application/geo+json, application/json", "User-Agent": "vedur-cli/0.1 (https://github.com/axelpaul/vedur-cli)" } });
    if (!response.ok) fail("LOCATION_NOT_FOUND", `Address geocoder returned HTTP ${response.status} for '${query}'.`);
    payload = await response.json();
  } catch (error) { if ((error as { code?: string }).code) throw error; fail("LOCATION_NOT_FOUND", `Could not resolve '${query}'. Use --near latitude,longitude or --station.`); }
  const matches = extractCoordinates(payload);
  if (matches.length === 0) fail("LOCATION_NOT_FOUND", `No address/place found for '${query}'. Use --near latitude,longitude or --station.`);
  if (matches.length > 1) fail("AMBIGUOUS_LOCATION", `More than one location matches '${query}'. Use a fuller address or --near latitude,longitude.`, matches);
  const result = { ...matches[0]!, source: "geocoder" as const };
  return { ...result, elevationM: await elevationAt(result.latitude, result.longitude) };
}

/** A small terrain check prevents an 8 km, 471 m mountain station from winning
 * over a 12 km lowland station for an address near sea level.  It is advisory:
 * if unavailable, selection safely falls back to geographic nearest. */
async function elevationAt(latitude: number, longitude: number): Promise<number | undefined> {
  try {
    const url = new URL("https://api.open-meteo.com/v1/elevation");
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    const body = await response.json() as { elevation?: unknown[] };
    const value = Number(body.elevation?.[0]);
    return Number.isFinite(value) ? value : undefined;
  } catch { return undefined; }
}

function extractCoordinates(payload: unknown): Omit<ResolvedLocation, "source">[] {
  const p = payload as { features?: unknown[]; results?: unknown[] };
  const rows = Array.isArray(p?.features) ? p.features : Array.isArray(p?.results) ? p.results : Array.isArray(payload) ? payload : [];
  return rows.map((row: any) => {
    const coords = row?.geometry?.coordinates || (row?.geometry?.x !== undefined ? [row.geometry.x, row.geometry.y] : undefined);
    if (!Array.isArray(coords) || !Number.isFinite(Number(coords[0])) || !Number.isFinite(Number(coords[1]))) return undefined;
    // GeoJSON is lon,lat; ArcGIS x,y has the same ordering in EPSG:4326.
    return { label: String(row?.properties?.label || row?.properties?.display_name || row?.properties?.name || row?.attributes?.address || row?.place_name || "resolved location"), longitude: Number(coords[0]), latitude: Number(coords[1]) };
  }).filter((x): x is Omit<ResolvedLocation, "source"> => x !== undefined);
}

export async function selectNearestStation(location: ResolvedLocation): Promise<SelectedStation> {
  const candidates = await activeAutomaticStations();
  if (!candidates.length) fail("STATION_NOT_FOUND", "No active automatic weather stations are available.");
  const locationElevation = location.elevationM ?? await elevationAt(location.latitude, location.longitude);
  const ranked = candidates.map(station => {
    const distance = distanceKm(location.latitude, location.longitude, station.latitude!, station.longitude!);
    const elevationDifference = locationElevation === undefined || station.elevationM === null ? undefined : Math.abs(station.elevationM - locationElevation);
    // One kilometre for each 50 m mismatch modestly favours representative
    // lowland/highland stations without claiming to understand local exposure.
    const penalty = elevationDifference === undefined ? 0 : elevationDifference / 50;
    const rationale = [`${distance.toFixed(1)} km away`];
    if (elevationDifference !== undefined) rationale.push(`${elevationDifference.toFixed(0)} m elevation difference (terrain-adjusted selection)`);
    else rationale.push("closest active automatic station (location elevation unavailable)");
    return { station, distanceKm: distance, score: distance + penalty, rationale };
  }).sort((a, b) => a.score - b.score || a.station.id - b.station.id);
  return ranked[0]!;
}
