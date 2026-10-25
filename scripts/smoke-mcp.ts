import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const binary = process.argv.find((arg, index) => index >= 2 && !arg.startsWith("--")) || "./dist/vedur";
const client = new Client({ name: "vedur-smoke", version: "0.0.0" });
try {
  await client.connect(new StdioClientTransport({ command: binary, args: ["serve"], stderr: "pipe" }));
  const names = (await client.listTools()).tools.map(tool => tool.name).sort();
  if (names.join(",") !== "forecast,locations_list,now,observations_latest,quakes,stations_find,stations_nearest,warnings") throw new Error(`Unexpected tools: ${names.join(",")}`);
  const invalid = await client.callTool({ name: "forecast", arguments: { place: "Reykjavík", hours: 241 } });
  if (!invalid.isError) throw new Error("Invalid input was accepted");
  if (process.argv.includes("--live")) {
    const result = await client.callTool({ name: "forecast", arguments: { place: "Reykjavík", hours: 2 } });
    if (result.isError) throw new Error("Live forecast call failed");
    const data = JSON.parse((result.content[0] as { text: string }).text) as { data?: { forecast?: unknown[] } };
    if (!data.data?.forecast?.length) throw new Error("Live forecast returned no rows");
    const quakes = await client.callTool({ name: "quakes", arguments: { since: "48h", limit: 5 } });
    if (quakes.isError) throw new Error(`Live quakes call failed: ${JSON.stringify(quakes.content)}`);
    const nearest = await client.callTool({ name: "stations_nearest", arguments: { near: "65.6835,-18.1002" } });
    if (nearest.isError) throw new Error(`Live stations_nearest call failed: ${JSON.stringify(nearest.content)}`);
  }
  console.log(`MCP smoke passed: ${names.join(", ")}${process.argv.includes("--live") ? "; live forecast, quakes, stations_nearest OK" : ""}`);
} finally {
  await client.close();
}
