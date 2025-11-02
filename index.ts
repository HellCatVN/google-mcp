// Load environment variables from .env file
// This must be imported first before any other code that uses process.env
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

// Get the directory of the current module (works in ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// CRITICAL: Check if we're being spawned by bridge BEFORE loading .env file
// When bridge spawns us, it sets MCP_SPAWNED_BY_BRIDGE=true and removes MCP_ENDPOINT
// We MUST check MCP_SPAWNED_BY_BRIDGE FIRST - this is the definitive signal
// PM2 also pipes stdin, so checking stdin.isTTY alone is insufficient
// 
// Detection priority:
// 1. MCP_SPAWNED_BY_BRIDGE=true → definitely spawned by bridge, exclude MCP_ENDPOINT from .env
// 2. PM2 env vars present + MCP_ENDPOINT in .env → PM2 running bridge mode, load MCP_ENDPOINT
// 3. Otherwise → check stdin and MCP_ENDPOINT presence

// PRIMARY CHECK: Bridge sets this explicitly when spawning children
const isSpawnedByBridge = process.env.MCP_SPAWNED_BY_BRIDGE === "true";

const isPiped = !process.stdin.isTTY;
const hasMcpEndpointBeforeEnv = !!(process.env.MCP_ENDPOINT || process.env.MCP_ENDPOINTS?.split(",")[0]);
const isPm2 = !!(process.env.PM2_HOME || process.env.pm_id !== undefined || process.env.name !== undefined);

// Load .env file from project root using absolute path
// This ensures it works even when PM2 runs from a different working directory
const envPath = join(__dirname, ".env");
console.log("🔍 Environment configuration:");
console.log(`   Project root: ${__dirname}`);
console.log(`   Current working directory: ${process.cwd()}`);
console.log(`   .env file path: ${envPath}`);
console.log(`   .env file exists: ${existsSync(envPath)}`);

// If we're spawned by bridge, don't load MCP_ENDPOINT from .env to prevent recursion
let envResult;
if (isSpawnedByBridge) {
  // Load .env but exclude MCP_ENDPOINT to prevent recursion
  // We need to manually remove it from process.env after loading because dotenv.config()
  // modifies process.env directly
  envResult = dotenv.config({ path: envPath });
  // Explicitly remove MCP_ENDPOINT from process.env after loading .env
  // This prevents the spawned child from detecting MCP_ENDPOINT and running bridge mode again
  delete process.env.MCP_ENDPOINT;
  delete process.env.MCP_ENDPOINTS;
  if (envResult.parsed) {
    delete envResult.parsed.MCP_ENDPOINT;
    delete envResult.parsed.MCP_ENDPOINTS;
  }
  if (envResult.error) {
    console.log(`   ⚠️  Error loading .env: ${envResult.error.message}`);
  } else {
    console.log(`   ✓ .env file loaded successfully (MCP_ENDPOINT excluded to prevent recursion)`);
    console.log(`   Loaded ${Object.keys(envResult.parsed || {}).length} environment variables`);
  }
} else {
  envResult = dotenv.config({ path: envPath });
  if (envResult.error) {
    console.log(`   ⚠️  Error loading .env: ${envResult.error.message}`);
  } else {
    console.log(`   ✓ .env file loaded successfully`);
    console.log(`   Loaded ${Object.keys(envResult.parsed || {}).length} environment variables`);
  }
}

// Now check MCP_ENDPOINT after loading .env (if we weren't spawned by bridge)
const hasMcpEndpoint = !!(process.env.MCP_ENDPOINT || process.env.MCP_ENDPOINTS?.split(",")[0]);

// Debug logging for mode detection
console.log("🔍 Mode detection:");
console.log(`   MCP_SPAWNED_BY_BRIDGE: ${process.env.MCP_SPAWNED_BY_BRIDGE || 'NOT SET'}`);
console.log(`   stdin.isTTY: ${process.stdin.isTTY}`);
console.log(`   isPiped: ${isPiped}`);
console.log(`   Running under PM2: ${isPm2}`);
console.log(`   PM2 env vars: PM2_HOME=${process.env.PM2_HOME ? 'SET' : 'NOT SET'}, pm_id=${process.env.pm_id || 'NOT SET'}, name=${process.env.name || 'NOT SET'}`);
console.log(`   MCP_ENDPOINT before .env: ${hasMcpEndpointBeforeEnv ? 'SET' : 'NOT SET'}`);
console.log(`   Spawned by bridge: ${isSpawnedByBridge} (${isSpawnedByBridge ? 'explicit flag set' : 'not spawned by bridge'})`);
console.log(`   MCP_ENDPOINT from env (after .env): ${process.env.MCP_ENDPOINT ? process.env.MCP_ENDPOINT.replace(/token=[^&]+/, "token=***") : 'NOT SET'}`);
console.log(`   MCP_ENDPOINTS from env (after .env): ${process.env.MCP_ENDPOINTS ? process.env.MCP_ENDPOINTS.replace(/token=[^&]+/, "token=***") : 'NOT SET'}`);

// Auto-detect mode:
// - If spawned by bridge: run stdio mode (MCP_ENDPOINT was explicitly removed)
// - If MCP_ENDPOINT is set (and NOT spawned by bridge): run bridge mode
// - Otherwise: run HTTP server mode
const MCP_ENDPOINT = isSpawnedByBridge ? undefined : (process.env.MCP_ENDPOINT || process.env.MCP_ENDPOINTS?.split(",")[0]);
console.log(`   MCP_ENDPOINT (resolved): ${MCP_ENDPOINT ? MCP_ENDPOINT.replace(/token=[^&]+/, "token=***") : 'undefined'}`);
console.log(`   Will run in: ${isSpawnedByBridge ? 'STDIO MODE (spawned by bridge)' : MCP_ENDPOINT ? 'BRIDGE MODE' : 'HTTP SERVER MODE'}`);

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
