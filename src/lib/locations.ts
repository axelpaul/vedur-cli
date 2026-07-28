import { fail } from "./error.ts";
import type { ResolvedLocation } from "./location.ts";
import { mkdir } from "node:fs/promises";

export type SavedLocation = {
  name: string;
  label: string;
  latitude: number;
  longitude: number;
  elevationM?: number;
  forecastPointId?: number;
  createdAt: string;
};

type Store = { locations: SavedLocation[] };

function configFile(): string {
  const root = process.env.XDG_CONFIG_HOME || `${process.env.HOME || "."}/.config`;
  return `${root}/vedur-cli/locations.json`;
}

function canonical(name: string): string { return name.trim().toLocaleLowerCase("en-US"); }

export async function listLocations(): Promise<SavedLocation[]> {
  try {
    const store = await Bun.file(configFile()).json() as Store;
    return Array.isArray(store.locations) ? store.locations.sort((a, b) => a.name.localeCompare(b.name)) : [];
  } catch { return []; }
}

export async function savedLocation(name: string): Promise<SavedLocation | undefined> {
  const key = canonical(name);
  return (await listLocations()).find(location => canonical(location.name) === key);
}

export async function addLocation(name: string, location: ResolvedLocation, forecastPointId?: number): Promise<SavedLocation> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$/.test(name)) fail("INVALID_LOCATION_NAME", "Location names must be 1–32 characters: letters, numbers, _ or -.");
  const locations = await listLocations();
  const saved: SavedLocation = { name, label: location.label, latitude: location.latitude, longitude: location.longitude, elevationM: location.elevationM, forecastPointId, createdAt: new Date().toISOString() };
  const index = locations.findIndex(item => canonical(item.name) === canonical(name));
  if (index >= 0) locations[index] = saved; else locations.push(saved);
  const file = configFile();
  await mkdir(file.slice(0, file.lastIndexOf("/")), { recursive: true });
  await Bun.write(file, JSON.stringify({ locations }, null, 2) + "\n");
  return saved;
}

export async function removeLocation(name: string): Promise<void> {
  const locations = await listLocations();
  const remaining = locations.filter(item => canonical(item.name) !== canonical(name));
  if (remaining.length === locations.length) fail("LOCATION_NOT_FOUND", `No saved location named '${name}'.`);
  const file = configFile();
  await mkdir(file.slice(0, file.lastIndexOf("/")), { recursive: true });
  await Bun.write(file, JSON.stringify({ locations: remaining }, null, 2) + "\n");
}

export function asResolvedLocation(saved: SavedLocation): ResolvedLocation {
  return { label: saved.label, latitude: saved.latitude, longitude: saved.longitude, elevationM: saved.elevationM, source: "saved" };
}
