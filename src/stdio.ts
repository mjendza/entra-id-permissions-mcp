#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { loadData } from "./data.js";
import { createServer } from "./server.js";
import { readVersion } from "./version.js";

async function main() {
  const version = readVersion();
  const config = loadConfig(version);
  const logger = createLogger(config.logFile);
  const data = await loadData(config, logger);
  const server = createServer({ version, data, logger });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is reserved for the JSON-RPC protocol; status goes to the file log.
  logger.log("entra-permissions-mcp running on stdio");
}

main().catch((err) => {
  // Last-resort fatal handler: stderr is safe (stdout carries the protocol).
  console.error("Fatal error starting entra-permissions-mcp:", err);
  process.exit(1);
});
