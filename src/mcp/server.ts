import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { nearestForecastPoint } from "../api/forecast.ts";
import { warnings } from "../api/cap.ts";
import { geocode } from "../lib/location.ts";
import { addLocation, listLocations, removeLocation, savedLocation } from "../lib/locations.ts";
import { AGGREGATIONS, findStations, forecast, latestObservations, listQuakes, nearestStation, now } from "../lib/ops.ts";
import { VERSION } from "../version.ts";

export const WRITES_ENV = "VEDUR_MCP_ENABLE_WRITES";

function result(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ source: "Icelandic Met Office", retrievedAt: new Date().toISOString(), data }) }] };
}
function error(value: unknown) {
  return { isError: true, content: [{ type: "text" as const, text: value instanceof Error ? value.message : "Weather lookup failed." }] };
}

const near = z.string().regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, "latitude,longitude").optional()
  .describe("Coordinates as \"latitude,longitude\" (e.g. \"64.1417,-21.9266\"). Overrides place.");
const place = z.string().min(1).optional()
  .describe("Icelandic place name, street address, or saved location name (e.g. \"Akureyri\", \"Hallgrímskirkja\").");
const id = z.number().int().positive();

export function createServer(): McpServer {
  const server = new McpServer({ name: "vedur", version: VERSION });

  server.registerTool("forecast", {
    description: "Hourly Icelandic Met Office spot forecast (model output, not observations) for a place, address, saved location, coordinates, or an exact forecast-point ID. Same as `vedur forecast`.",
    inputSchema: { place, near, point: id.optional().describe("Exact Veður forecast-point ID; overrides place/near."), hours: z.number().int().min(1).max(240).default(24) },
  }, async ({ place, near, point, hours }) => {
    try { return result(await forecast({ place, near, pointId: point, hours })); } catch (e) { return error(e); }
  });

  server.registerTool("now", {
    description: "Latest 10-minute weather observation from the automatic station selected near a place/address/saved location/coordinates, or for an explicit station or region ID. Includes the selected station and rationale. Same as `vedur now`.",
    inputSchema: { place, near, station: id.optional().describe("Weather station ID; overrides place/near."), region: id.optional().describe("Forecast region ID; returns all stations in it.") },
  }, async ({ place, near, station, region }) => {
    try { return result(await now({ place, near, stationId: station, regionId: region })); } catch (e) { return error(e); }
  });

  server.registerTool("observations_latest", {
    description: "Latest observations for a station or region at a chosen aggregation (10min, hour, day, month, year). Same as `vedur observations latest`.",
    inputSchema: {
      station: id.optional().describe("Weather station ID."),
      region: id.optional().describe("Forecast region ID."),
      aggregation: z.enum(AGGREGATIONS).default("10min"),
      parameters: z.enum(["basic", "all"]).default("basic"),
    },
  }, async ({ station, region, aggregation, parameters }) => {
    try { return result(await latestObservations({ stationId: station, regionId: region, aggregation, parameters })); } catch (e) { return error(e); }
  });

  server.registerTool("stations_find", {
    description: "Find Icelandic weather stations by name. Same as `vedur stations find`.",
    inputSchema: { query: z.string().min(1), activeOnly: z.boolean().default(true), limit: z.number().int().min(1).max(25).default(10) },
  }, async ({ query, activeOnly, limit }) => {
    try { return result(await findStations(query, activeOnly, limit)); } catch (e) { return error(e); }
  });

  server.registerTool("stations_nearest", {
    description: "Select the active automatic weather station nearest a place/address/saved location or coordinates (distance plus elevation difference) without fetching observations. Same as `vedur stations nearest`.",
    inputSchema: { place, near },
  }, async ({ place, near }) => {
    try { return result(await nearestStation({ place, near })); } catch (e) { return error(e); }
  });

  server.registerTool("warnings", {
    description: "Active Icelandic Met Office weather warnings (CAP), optionally filtered by category. Returns at most 50 summaries without the raw CAP payload that `vedur warnings` includes.",
    inputSchema: { category: z.string().optional().describe("CAP category, e.g. \"Met\".") },
  }, async ({ category }) => {
    try { return result((await warnings(category)).slice(0, 50).map(({ raw: _raw, ...summary }) => summary)); } catch (e) { return error(e); }
  });

  server.registerTool("quakes", {
    description: "Recent earthquakes in and around Iceland from the Icelandic Met Office SeisComP catalogue, newest first. Same as `vedur quakes`.",
    inputSchema: {
      since: z.string().default("24h").describe("Start: ISO 8601 time or relative duration like 30m, 24h, 7d, 2w."),
      until: z.string().optional().describe("End: ISO 8601 time or relative duration. Defaults to now."),
      near: z.string().regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, "latitude,longitude").optional().describe("Only quakes within radiusKm of \"latitude,longitude\"."),
      radiusKm: z.number().positive().default(50),
      minMagnitude: z.number().optional(),
      mode: z.enum(["manual", "automatic"]).optional().describe("Only manually reviewed or only automatic events."),
      limit: z.number().int().min(1).max(500).default(100),
    },
  }, async (input) => {
    try { return result(await listQuakes(input)); } catch (e) { return error(e); }
  });

  server.registerTool("locations_list", {
    description: "List locally saved weather locations. Read-only. Same as `vedur locations list`.",
    inputSchema: {},
  }, async () => {
    try { return result(await listLocations()); } catch (e) { return error(e); }
  });

  if (process.env[WRITES_ENV] === "1") {
    server.registerTool("location_add", {
      description: "Save an Icelandic weather location locally (writes ~/.config/vedur-cli/locations.json). Requires exact-name confirmation; never silently replaces an existing name. Same as `vedur locations add`.",
      inputSchema: {
        name: z.string().trim().min(1).max(32).describe("1–32 characters: letters, numbers, _ or -."),
        place: z.string().trim().min(1).max(160),
        point: id.optional().describe("Explicit forecast-point ID; defaults to the nearest."),
        confirmName: z.string().describe("Must exactly equal name."),
        replace: z.boolean().default(false),
      },
    }, async ({ name, place, point, confirmName, replace }) => {
      try {
        if (confirmName !== name) throw new Error("confirmName must exactly match the saved location name.");
        if (!replace && (await savedLocation(name))) throw new Error("Location already exists; set replace=true to overwrite it.");
        const location = await geocode(place);
        const forecastPointId = point ?? (await nearestForecastPoint(location.latitude, location.longitude)).station.id;
        return result(await addLocation(name, location, forecastPointId));
      } catch (e) { return error(e); }
    });

    server.registerTool("location_remove", {
      description: "Remove one locally saved weather location. Requires exact-name confirmation. Same as `vedur locations remove`.",
      inputSchema: { name: z.string().trim().min(1).max(80), confirmName: z.string().describe("Must exactly equal name.") },
    }, async ({ name, confirmName }) => {
      try {
        if (confirmName !== name) throw new Error("confirmName must exactly match the saved location name.");
        await removeLocation(name);
        return result({ removed: name });
      } catch (e) { return error(e); }
    });
  }
  return server;
}

export async function serve(): Promise<void> {
  await createServer().connect(new StdioServerTransport());
}
