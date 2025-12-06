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
const isPm2 = !!(process.env.PM2_HOME || process.env.pm_id !== undefined || process.env.name !== undefined);

// Load accounts.json configuration (MANDATORY - no fallback to .env)
import { loadAccountsConfig, findHttpAccount, ensureTokenPathEnv } from "./utils/config.js";
console.log("🔍 Loading accounts configuration:");
let accountsConfig: { accounts: Array<{ mcpEndpoint?: string; tokenPath: string; http?: boolean }> };
try {
  accountsConfig = loadAccountsConfig();
  console.log(`   ✓ Accounts config loaded (${accountsConfig.accounts.length} account(s))`);
} catch (error) {
  console.error(`   ❌ Failed to load accounts config: ${error instanceof Error ? error.message : String(error)}`);
  console.error(`\n💡 Please create config/accounts.json with your account configuration.`);
  console.error(`   See config/accounts.json.example for reference.\n`);
  process.exit(1);
}

// Load .env file only for OAuth client credentials (CLIENT_ID, CLIENT_SECRET, etc.)
// Token path and MCP endpoint are now configured via accounts.json
const envPath = join(__dirname, ".env");
console.log("🔍 Environment configuration:");
console.log(`   Project root: ${__dirname}`);
console.log(`   Current working directory: ${process.cwd()}`);
console.log(`   .env file path: ${envPath}`);
console.log(`   .env file exists: ${existsSync(envPath)}`);

// Load .env for OAuth credentials only (not for token path or endpoint)
let envResult;
if (isSpawnedByBridge) {
  // Load .env but exclude MCP_ENDPOINT to prevent recursion
  envResult = dotenv.config({ path: envPath });
  delete process.env.MCP_ENDPOINT;
  delete process.env.MCP_ENDPOINTS;
  if (envResult.parsed) {
    delete envResult.parsed.MCP_ENDPOINT;
    delete envResult.parsed.MCP_ENDPOINTS;
  }
  if (envResult.error && !envResult.error.message.includes("ENOENT")) {
    console.log(`   ⚠️  Error loading .env: ${envResult.error.message}`);
  } else if (envResult.parsed) {
    console.log(`   ✓ .env file loaded (OAuth credentials only)`);
  }
} else {
  envResult = dotenv.config({ path: envPath });
  if (envResult.error && !envResult.error.message.includes("ENOENT")) {
    console.log(`   ⚠️  Error loading .env: ${envResult.error.message}`);
  } else if (envResult.parsed) {
    console.log(`   ✓ .env file loaded (OAuth credentials only)`);
  }
}

// Configure account from accounts.json (MANDATORY - no fallback)
let selectedAccount: { mcpEndpoint?: string; tokenPath: string; http?: boolean };
if (!isSpawnedByBridge) {
  // Check if any account has an endpoint (bridge mode)
  const accountWithEndpoint = accountsConfig.accounts.find(a => a.mcpEndpoint);
  
  if (accountWithEndpoint) {
    // Bridge mode: use account with endpoint
    selectedAccount = accountWithEndpoint as { mcpEndpoint?: string; tokenPath: string; http?: boolean };
    ensureTokenPathEnv(selectedAccount.tokenPath);
    console.log(`   ✓ Using account with endpoint for bridge mode`);
    console.log(`   ✓ Set GOOGLE_OAUTH_TOKEN_PATH from accounts.json: ${selectedAccount.tokenPath}`);
  } else {
    // HTTP mode: find the HTTP account (required)
    try {
      selectedAccount = findHttpAccount(accountsConfig.accounts);
      ensureTokenPathEnv(selectedAccount.tokenPath);
      console.log(`   ✓ Using HTTP account from config`);
      console.log(`   ✓ Set GOOGLE_OAUTH_TOKEN_PATH from accounts.json: ${selectedAccount.tokenPath}`);
    } catch (error) {
      console.error(`   ❌ ${error instanceof Error ? error.message : String(error)}`);
      console.error(`\n💡 Please configure exactly one account with http: true in config/accounts.json for HTTP mode.`);
      console.error(`   Or add an account with mcpEndpoint for bridge mode.\n`);
      process.exit(1);
    }
  }
} else {
  // When spawned by bridge, we still need to set token path from accounts.json
  // Find any account (prefer HTTP account, but any will work)
  try {
    selectedAccount = findHttpAccount(accountsConfig.accounts);
  } catch {
    // If no HTTP account, use first account
    if (accountsConfig.accounts.length > 0) {
      selectedAccount = accountsConfig.accounts[0] as { mcpEndpoint?: string; tokenPath: string; http?: boolean };
    } else {
      console.error(`   ❌ No accounts found in config/accounts.json`);
      process.exit(1);
    }
  }
  ensureTokenPathEnv(selectedAccount.tokenPath);
  console.log(`   ✓ Set GOOGLE_OAUTH_TOKEN_PATH from accounts.json: ${selectedAccount.tokenPath}`);
}

// Debug logging for mode detection
console.log("🔍 Mode detection:");
console.log(`   MCP_SPAWNED_BY_BRIDGE: ${process.env.MCP_SPAWNED_BY_BRIDGE || 'NOT SET'}`);
console.log(`   stdin.isTTY: ${process.stdin.isTTY}`);
console.log(`   isPiped: ${isPiped}`);
console.log(`   Running under PM2: ${isPm2}`);
console.log(`   Spawned by bridge: ${isSpawnedByBridge} (${isSpawnedByBridge ? 'explicit flag set' : 'not spawned by bridge'})`);

// Auto-detect mode from accounts.json (MANDATORY - no fallback to env)
// - If spawned by bridge: run stdio mode
// - If account has mcpEndpoint: run bridge mode
// - Otherwise: run HTTP server mode
let resolvedEndpoint: string | undefined;
if (!isSpawnedByBridge) {
  if (selectedAccount.mcpEndpoint) {
    resolvedEndpoint = selectedAccount.mcpEndpoint;
    console.log(`   ✓ Using MCP_ENDPOINT from accounts.json: ${resolvedEndpoint.replace(/token=[^&]+/, "token=***")}`);
    // Set it in process.env so bridge.ts can read it
    process.env.MCP_ENDPOINT = resolvedEndpoint;
  } else {
    // HTTP mode - no endpoint needed
    resolvedEndpoint = undefined;
    console.log(`   ✓ HTTP server mode (no endpoint in account config)`);
  }
}
const MCP_ENDPOINT = resolvedEndpoint;
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
