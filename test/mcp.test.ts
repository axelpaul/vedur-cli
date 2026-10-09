import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("MCP stdio handshake, tool discovery and validation", async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: ["src/index.ts", "serve"], cwd: process.cwd(), stderr: "pipe" });
  const client = new Client({ name: "vedur-test", version: "0.1.0" });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    expect(listed.tools.map(tool => tool.name).sort()).toEqual(["forecast", "locations_list", "now", "stations_find", "warnings"]);
    const invalid = await client.callTool({ name: "forecast", arguments: { place: "Reykjavík", hours: 241 } });
    expect(invalid.isError).toBe(true);
  } finally {
    await client.close();
  }
});

test("MCP write tools require startup opt-in and exact-name confirmation", async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: ["src/index.ts", "serve"], cwd: process.cwd(), stderr: "pipe", env: { ...process.env, VEDUR_MCP_ENABLE_WRITES: "1" } });
  const client = new Client({ name: "vedur-write-test", version: "0.1.0" });
  try {
    await client.connect(transport);
    const names = (await client.listTools()).tools.map(tool => tool.name);
    expect(names).toContain("location_add");
    expect(names).toContain("location_remove");
    const rejected = await client.callTool({ name: "location_remove", arguments: { name: "cabin", confirmName: "not-cabin" } });
    expect(rejected.isError).toBe(true);
  } finally {
    await client.close();
  }
});
