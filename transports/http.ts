import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import http from "http";


export async function createHttpTransport(server: Server, port: number = 3000) {
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
  // MCP endpoint path - fixed to /mcp
  const mcpPath = "/mcp";

  // Create HTTP/SSE transport for MCP protocol
  const httpTransport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => Math.random().toString(36).substring(2, 15),
    enableJsonResponse: false, // Use SSE streams by default
    allowedHosts,
    allowedOrigins,
    enableDnsRebindingProtection,
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

    // Connection info endpoint
    if (req.method === "GET" && url.pathname === "/info") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          mcp_endpoint: `http://${req.headers.host}${mcpPath}`,
          transports: {
            http: `http://${req.headers.host}${mcpPath}`,
            sse: `http://${req.headers.host}${mcpPath}`,
          },
          endpoints: {
            health: `http://${req.headers.host}/health`,
            mcp: `http://${req.headers.host}${mcpPath}`,
          },
          protocol: {
            name: "MCP",
            version: "2024-11-05",
            note: "Send 'initialize' request, then 'tools/list' to get available tools via HTTP POST to /mcp endpoint",
          },
        })
      );
      return;
    }

    // Tools list endpoint - for debugging and client discovery
    if (req.method === "GET" && url.pathname === "/tools") {
      try {
        // Simulate a tools/list request to get tools from the server
        // The MCP SDK Server handles tools/list requests internally
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "ok",
            message: "Use MCP protocol 'tools/list' request via /mcp endpoint to get tools",
            mcp_endpoint: `http://${req.headers.host}${mcpPath}`,
            note: "Tools are available via standard MCP tools/list JSON-RPC method",
          })
        );
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: `Failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          })
        );
      }
      return;
    }

    // Main MCP endpoint (HTTP/SSE)
    if (url.pathname === mcpPath) {
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
      return new Promise<void>((resolve, reject) => {
        // Register error handler BEFORE listen() to catch synchronous errors
        httpServer.on("error", (err: NodeJS.ErrnoException) => {
          console.error(`HTTP Server Error:`, err.message);
          console.error(`Error Code:`, err.code);
          console.error(`Error Stack:`, err.stack);
          if (err.code === "EADDRINUSE") {
            const suggestedPort = port === 3000 ? 3001 : port === 3001 ? 3002 : port + 1;
            console.error(`\n❌ Port ${port} is already in use!`);
            console.error(`💡 Solutions:`);
            console.error(`   1. Stop the process using port ${port}: lsof -ti:${port} | xargs kill -9`);
            console.error(`   2. Change PORT in your .env file (or use: PORT=${suggestedPort} pnpm dev)`);
            console.error(`   3. Find available port: lsof -i:${suggestedPort} || echo "Port ${suggestedPort} is available"\n`);
            reject(new Error(`Port ${port} is already in use. Try PORT=${suggestedPort} or stop the process using port ${port}.`));
          } else {
            console.error(`Unexpected error:`, err);
            reject(err);
          }
        });
        
        // Start the HTTP server FIRST, then connect transports
        // Explicitly bind to localhost to avoid any host resolution issues
        httpServer.listen(port, "127.0.0.1", async () => {
          try {
            // Connect the server to HTTP/SSE transport AFTER the server is listening
            await server.connect(httpTransport);
            
            console.log(`🚀 Google MCP Server is running`);
            console.log(`📡 HTTP endpoint: http://localhost:${port}${mcpPath}`);
            console.log(`ℹ️  Connection info: http://localhost:${port}/info`);
            console.log(`📋 Available tools will be returned when clients send 'tools/list' request`);
            resolve();
          } catch (connectError) {
            console.error("Error connecting transports:", connectError);
            reject(connectError);
          }
        });
      });
    },
    close: async () => {
      // Close HTTP transport
      await httpTransport.close();

      return new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    },
    server: httpServer,
  };
}
