// Load environment variables from .env file
// This must be imported first before any other code that uses process.env
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

// Get the directory of the current module (works in ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root using absolute path
// This ensures it works even when PM2 runs from a different working directory
const envPath = join(__dirname, ".env");
console.log("🔍 Environment configuration:");
console.log(`   Project root: ${__dirname}`);
console.log(`   Current working directory: ${process.cwd()}`);
console.log(`   .env file path: ${envPath}`);
console.log(`   .env file exists: ${existsSync(envPath)}`);
const result = dotenv.config({ path: envPath });
if (result.error) {
  console.log(`   ⚠️  Error loading .env: ${result.error.message}`);
} else {
  console.log(`   ✓ .env file loaded successfully`);
  console.log(`   Loaded ${Object.keys(result.parsed || {}).length} environment variables`);
}

// CRITICAL: Check if we're being spawned by bridge (piped stdin) BEFORE checking MCP_ENDPOINT
// When bridge spawns us, stdin is piped, so we should run in stdio mode, not bridge mode
// This prevents infinite recursion even if .env file has MCP_ENDPOINT
// However, PM2 also pipes stdin, so we need a better way to detect if we're spawned by bridge
// Bridge.ts explicitly removes MCP_ENDPOINT from child environment, so if it's set, we're NOT spawned by bridge
const isPiped = !process.stdin.isTTY;
const hasMcpEndpoint = !!(process.env.MCP_ENDPOINT || process.env.MCP_ENDPOINTS?.split(",")[0]);

// Debug logging for mode detection
console.log("🔍 Mode detection:");
console.log(`   stdin.isTTY: ${process.stdin.isTTY}`);
console.log(`   isPiped: ${isPiped}`);
console.log(`   MCP_ENDPOINT from env: ${process.env.MCP_ENDPOINT ? process.env.MCP_ENDPOINT.replace(/token=[^&]+/, "token=***") : 'NOT SET'}`);
console.log(`   MCP_ENDPOINTS from env: ${process.env.MCP_ENDPOINTS ? process.env.MCP_ENDPOINTS.replace(/token=[^&]+/, "token=***") : 'NOT SET'}`);

// Auto-detect mode:
// - If MCP_ENDPOINT is set, we should run in bridge mode (regardless of isPiped)
//   Reason: bridge.ts removes MCP_ENDPOINT from child processes, so if it's still set,
//   we're NOT spawned by bridge (even if PM2 pipes stdin)
// - If MCP_ENDPOINT is NOT set but we're piped, we're likely spawned by bridge, run stdio mode
// - If MCP_ENDPOINT is NOT set and NOT piped, run HTTP server mode
const MCP_ENDPOINT = hasMcpEndpoint ? (process.env.MCP_ENDPOINT || process.env.MCP_ENDPOINTS?.split(",")[0]) : undefined;
console.log(`   MCP_ENDPOINT (resolved): ${MCP_ENDPOINT ? MCP_ENDPOINT.replace(/token=[^&]+/, "token=***") : 'undefined'}`);
console.log(`   Will run in: ${MCP_ENDPOINT ? 'BRIDGE MODE' : isPiped ? 'STDIO MODE (spawned by bridge)' : 'HTTP SERVER MODE'}`);

async function main() {
  if (MCP_ENDPOINT) {
    // Bridge mode: connect to external WebSocket endpoint
    // Dynamically import and run bridge.ts (it has its own main() function and error handling)
    console.log("🔗 Bridge mode detected (MCP_ENDPOINT is set)");
    console.log(`   Endpoint: ${MCP_ENDPOINT.replace(/token=[^&]+/, "token=***")}`);
    await import("./bridge.js");
  } else {
    // HTTP server mode or stdio mode (spawned by bridge)
    await runHttpServer();
  }
}

async function runHttpServer() {
  const { createGoogleMcpServer } = await import("./server-setup.js");
  const { createHttpTransport } = await import("./transports/http.js");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");

  // Create the MCP server instance
  const server = createGoogleMcpServer();

  // Detect if we're being piped (spawned by bridge) by checking if stdin is a TTY
  // When bridge spawns us, stdin is a pipe, not a TTY
  const isPiped = !process.stdin.isTTY;

  if (isPiped) {
    // Stdio mode - spawned by bridge, communicate via stdin/stdout
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      await stdioTransport.close();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      await stdioTransport.close();
      process.exit(0);
    });
  } else {
    // HTTP transport mode - running directly
    const port = parseInt(process.env.PORT || "3000");
    const httpTransport = await createHttpTransport(server, port);
    await httpTransport.start();

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      await httpTransport.close();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      await httpTransport.close();
      process.exit(0);
    });
  }
}

// Start the server with error handling
main().catch((error) => {
  console.error("\n💥 Fatal Error:", error.message);
  if (error.message.includes("Authentication") || error.message.includes("OAuth") || error.message.includes("invalid_client")) {
    console.error("\n💡 Authentication Setup Required:");
    console.error("   Please configure your .env file with valid Google OAuth credentials.");
    console.error("   See template.env for reference.\n");
  }
  process.exit(1);
});
