import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { forecastPoint, nearestForecastPoint } from "../api/forecast.ts";
import { latest, stations } from "../api/weather.ts";
import { warnings } from "../api/cap.ts";
import { geocode, selectNearestStation } from "../lib/location.ts";
import { addLocation, asResolvedLocation, listLocations, removeLocation, savedLocation } from "../lib/locations.ts";

const server = new McpServer({ name: "vedur", version: "0.1.0" });

function result(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ source: "Icelandic Met Office", retrievedAt: new Date().toISOString(), data }) }] };
}
function error(value: unknown) {
  return { isError: true, content: [{ type: "text" as const, text: value instanceof Error ? value.message : "Weather lookup failed." }] };
}

server.registerTool("forecast", {
  description: "Get an hourly Icelandic Met Office forecast for an Icelandic place or saved location. Model forecast, not a live observation.",
  inputSchema: { place: z.string().min(1), hours: z.number().int().min(1).max(240).default(24) },
}, async ({ place, hours }) => {
  try {
    const saved = await savedLocation(place);
    const location = saved ? asResolvedLocation(saved) : await geocode(place);
    const selected = saved?.forecastPointId
      ? { station: { id: saved.forecastPointId, name: "saved preference", latitude: location.latitude, longitude: location.longitude, isVirtual: true }, distanceKm: 0 }
      : await nearestForecastPoint(location.latitude, location.longitude);
    return result({ location, selectedForecastPoint: { ...selected.station, distanceKm: Number(selected.distanceKm.toFixed(1)) }, forecast: await forecastPoint(selected.station.id, hours) });
  } catch (e) { return error(e); }
});

server.registerTool("now", {
  description: "Get the latest weather observation near an Icelandic place or saved location; includes selected station and observation time.",
  inputSchema: { place: z.string().min(1) },
}, async ({ place }) => {
  try {
    const saved = await savedLocation(place);
    const location = saved ? asResolvedLocation(saved) : await geocode(place);
    const selected = await selectNearestStation(location);
    return result({ location, selectedStation: { ...selected.station, distanceKm: Number(selected.distanceKm.toFixed(1)), rationale: selected.rationale }, observation: await latest({ stationId: selected.station.id, aggregation: "10min", parameters: "basic" }) });
  } catch (e) { return error(e); }
});

server.registerTool("stations_find", {
  description: "Find Icelandic weather stations by name.",
  inputSchema: { query: z.string().min(1), activeOnly: z.boolean().default(true), limit: z.number().int().min(1).max(25).default(10) },
}, async ({ query, activeOnly, limit }) => {
  try { return result((await stations(query, activeOnly)).slice(0, limit)); } catch (e) { return error(e); }
});

server.registerTool("warnings", {
  description: "List active Icelandic Met Office weather warnings. Returns a bounded summary, not full raw CAP payloads.",
  inputSchema: { category: z.string().optional() },
}, async ({ category }) => {
  try { return result((await warnings(category)).slice(0, 50).map(({ raw, ...summary }) => summary)); } catch (e) { return error(e); }
});

server.registerTool("locations_list", {
  description: "List locally saved weather locations. Read-only.",
  inputSchema: {},
}, async () => {
  try { return result(await listLocations()); } catch (e) { return error(e); }
});

if (process.env.VEDUR_MCP_ENABLE_WRITES === "1") {
  server.registerTool("location_add", {
    description: "Save an Icelandic weather location locally. Requires exact-name confirmation; never silently replaces an existing name.",
    inputSchema: {
      name: z.string().trim().min(1).max(80),
      place: z.string().trim().min(1).max(160),
      confirmName: z.string(),
      replace: z.boolean().default(false),
    },
  }, async ({ name, place, confirmName, replace }) => {
    try {
      if (confirmName !== name) throw new Error("confirmName must exactly match the saved location name.");
      if (!replace && (await savedLocation(name))) throw new Error("Location already exists; set replace=true to overwrite it.");
      const location = await geocode(place);
      const forecastPointId = (await nearestForecastPoint(location.latitude, location.longitude)).station.id;
      return result(await addLocation(name, location, forecastPointId));
    } catch (e) { return error(e); }
  });

  server.registerTool("location_remove", {
    description: "Remove one locally saved weather location. Requires exact-name confirmation.",
    inputSchema: { name: z.string().trim().min(1).max(80), confirmName: z.string() },
  }, async ({ name, confirmName }) => {
    try {
      if (confirmName !== name) throw new Error("confirmName must exactly match the saved location name.");
      await removeLocation(name);
      return result({ removed: name });
    } catch (e) { return error(e); }
  });
}

export async function serve(): Promise<void> {
  await server.connect(new StdioServerTransport());
}
