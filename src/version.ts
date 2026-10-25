import pkg from "../package.json" with { type: "json" };

/** Single source of truth for the CLI/MCP version: package.json. */
export const VERSION: string = pkg.version;
export const USER_AGENT = `vedur-cli/${VERSION} (https://github.com/axelpaul/vedur-cli)`;
