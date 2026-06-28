import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import { loadData } from "./data.js";

const PORT = Number(process.env.PORT ?? 3000);

const app = express();
app.use(express.json({ limit: "4mb" }));

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

// Stateless Streamable HTTP: a fresh server + transport per request. The data
// is read-only and cached in-process, so there is no per-session state to keep.
app.post("/mcp", async (req: Request, res: Response) => {
  const server = await createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("Error handling MCP request:", err);
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

// Pre-warm the dataset cache so the first request doesn't pay fetch latency and
// the process fails fast if neither the CDN nor the local fallback is reachable.
loadData()
  .then(() => {
    app.listen(PORT, () => {
      console.error(`entra-permissions-mcp HTTP server listening on http://localhost:${PORT}/mcp`);
    });
  })
  .catch((err) => {
    console.error("Failed to load data on startup:", err);
    process.exit(1);
  });
