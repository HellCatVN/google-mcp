import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { WebSocketServerTransport } from "@modelcontextprotocol/sdk/server/websocket.js";
import http from "http";

export function createHttpTransport(server: Server, port: number = 3000) {
  const httpServer = http.createServer();

  // Env-driven config
  const allowedHosts = (process.env.ALLOWED_HOSTS || "localhost,127.0.0.1")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);
  const enableDnsRebindingProtection =
    (process.env.ENABLE_DNS_REBINDING_PROTECTION || "false").toLowerCase() ===
    "true";
  const wsPath = process.env.MCP_WS_PATH || "/mcp";

  // Create a single StreamableHTTPServerTransport instance with session management (SSE over HTTP)
  const httpTransport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => Math.random().toString(36).substring(2, 15),
    enableJsonResponse: false, // Use SSE streams by default
    allowedHosts,
    allowedOrigins,
    enableDnsRebindingProtection,
  });

  // Create a WebSocket transport sharing the same HTTP server (upgrade on /mcp)
  const wsTransport = new WebSocketServerTransport({
    server: httpServer,
    path: wsPath,
  });

  httpServer.on("request", async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    // Health check endpoint
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          message: "Google MCP Server is running",
          transport: "streamable-http",
        })
      );
      return;
    }

    // Main MCP endpoint (HTTP/SSE)
    if (url.pathname === wsPath) {
      try {
        // Use the StreamableHTTPServerTransport to handle the request
        await httpTransport.handleRequest(req, res);
      } catch (error) {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: `Transport error: ${
                error instanceof Error ? error.message : String(error)
              }`,
            })
          );
        }
      }
      return;
    }

    // 404 for other paths
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  return {
    start: async () => {
      // Connect the server to both transports (HTTP/SSE and WebSocket)
      await server.connect(httpTransport);
      await server.connect(wsTransport);

      return new Promise<void>((resolve) => {
        httpServer.listen(port, () => {
          resolve();
        });
      });
    },
    close: async () => {
      // Close transports
      await httpTransport.close();
      await wsTransport.close();

      return new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    },
    server: httpServer,
  };
}
