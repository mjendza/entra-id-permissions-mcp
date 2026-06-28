import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { loadData } from "./data.js";
import { createServer } from "./server.js";
import { readVersion } from "./version.js";

// Optional, isolated transport: Express ships as an optionalDependency so the
// default stdio/npx path stays lean. Run via `npm run start:http`.
async function main() {
  const version = readVersion();
  const config = loadConfig(version);
  const logger = createLogger(config.logFile);
  // Pre-warm the dataset cache so the first request pays no fetch latency and we
  // fail fast if neither the CDN nor the local fallback is reachable.
  const data = await loadData(config, logger);

  const app = express();
  app.use(express.json({ limit: "4mb" }));

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  });

  // Stateless Streamable HTTP: a fresh server + transport per request. The data
  // is read-only and cached in-process, so there is no per-session state to keep.
  app.post("/mcp", async (req: Request, res: Response) => {
    const server = createServer({ version, data, logger });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      logger.log("error handling MCP request", { error: (err as Error).message });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  // Stateless mode does not support server-initiated streams over GET/DELETE.
  const methodNotAllowed = (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  };
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  app.listen(config.httpPort, () => {
    logger.log(`entra-permissions-mcp HTTP server listening on http://localhost:${config.httpPort}/mcp`);
  });
}

main().catch((err) => {
  console.error("Fatal error starting entra-permissions-mcp HTTP server:", err);
  process.exit(1);
});
