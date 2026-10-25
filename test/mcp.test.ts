import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export const READ_TOOLS = ["forecast", "locations_list", "now", "observations_latest", "quakes", "stations_find", "stations_nearest", "warnings"];

function connect(env: Record<string, string> = {}) {
  const base = { ...process.env } as Record<string, string>;
  delete base.VEDUR_MCP_ENABLE_WRITES;
  const transport = new StdioClientTransport({ command: process.execPath, args: ["src/index.ts", "serve"], cwd: process.cwd(), stderr: "pipe", env: { ...base, ...env } });
  const client = new Client({ name: "vedur-test", version: "0.0.0" });
  return { client, ready: client.connect(transport) };
}

test("MCP stdio handshake, read-only tool discovery and validation", async () => {
  const { client, ready } = connect();
  try {
    await ready;
    const names = (await client.listTools()).tools.map(tool => tool.name).sort();
    expect(names).toEqual(READ_TOOLS);
    expect(names).not.toContain("location_add");
    expect(names).not.toContain("location_remove");
    for (const [name, args] of [
      ["forecast", { place: "Reykjavík", hours: 241 }],
      ["observations_latest", { station: 1, aggregation: "week" }],
      ["quakes", { limit: 0 }],
      ["stations_nearest", { near: "not-coordinates" }],
      ["now", {}],
    ] as const) {
      const invalid = await client.callTool({ name, arguments: args });
      expect(invalid.isError).toBe(true);
    }
  } finally {
    await client.close();
  }
});

test("MCP write tools require startup opt-in and exact-name confirmation", async () => {
  const { client, ready } = connect({ VEDUR_MCP_ENABLE_WRITES: "1" });
  try {
    await ready;
    const names = (await client.listTools()).tools.map(tool => tool.name);
    expect(names).toContain("location_add");
    expect(names).toContain("location_remove");
    const rejected = await client.callTool({ name: "location_remove", arguments: { name: "home", confirmName: "not-home" } });
    expect(rejected.isError).toBe(true);
  } finally {
    await client.close();
  }
});
