/**
 * WebSocket MCP Bridge
 * 
 * Bridges stdio-based MCP server to WebSocket endpoints (like Xiaozhi MCP endpoint).
 * Follows MCP_NODE_DESIGN.MD specifications.
 * 
 * Usage:
 *   MCP_ENDPOINT=wss://api.xiaozhi.me/mcp/?token=... pnpm run bridge
 */

import dotenv from "dotenv";
import { WebSocket } from "ws";
import { spawn, ChildProcess } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { loadAccountsConfig } from "./utils/config.js";

const DEBUG_MODE = process.env.DEBUG === "true" || process.env.NODE_ENV === "development";
const INITIAL_BACKOFF = 1; // 1 second
const MAX_BACKOFF = 600; // 10 minutes (600 seconds)
const TARGET_SERVER = process.env.MCP_SERVER_NAME || "google-mcp";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load accounts.json configuration (MANDATORY - no fallback to .env)
console.log("🔍 Loading accounts configuration for bridge:");
let accountsConfig;
let ENDPOINT: string | undefined;
try {
  accountsConfig = loadAccountsConfig();
  console.log(`   ✓ Accounts config loaded (${accountsConfig.accounts.length} account(s))`);
  
  // Find account with mcpEndpoint (required for bridge mode)
  const accountWithEndpoint = accountsConfig.accounts.find(a => a.mcpEndpoint);
  if (accountWithEndpoint && accountWithEndpoint.mcpEndpoint) {
    ENDPOINT = accountWithEndpoint.mcpEndpoint;
    console.log(`   ✓ Using MCP_ENDPOINT from accounts.json: ${ENDPOINT.replace(/token=[^&]+/, "token=***")}`);
  } else {
    throw new Error("No account with mcpEndpoint found in config/accounts.json. Bridge mode requires an account with mcpEndpoint.");
  }
} catch (error) {
  console.error(`   ❌ Failed to load accounts config: ${error instanceof Error ? error.message : String(error)}`);
  console.error(`\n💡 Please create config/accounts.json with at least one account that has mcpEndpoint configured.`);
  console.error(`   Example: { "accounts": [{ "mcpEndpoint": "wss://api.xiaozhi.me/mcp/?token=...", "tokenPath": "~/.google-mcp/token.json" }] }\n`);
  process.exit(1);
}

// Load .env file only for OAuth client credentials (CLIENT_ID, CLIENT_SECRET, etc.)
// Endpoint is now configured via accounts.json
const envPath = join(__dirname, ".env");
dotenv.config({ path: envPath });

// State
let ws: WebSocket | null = null;
let childProcess: ChildProcess | null = null;
let reconnectAttempt = 0;
let backoff = INITIAL_BACKOFF;

/**
 * Logging utility with debug mode support
 * Uses console.log for normal operations, console.error only for actual errors
 * Only logs errors and important events when DEBUG_MODE is false
 */
function log(message: string, ...args: any[]): void {
  const prefix = `[${TARGET_SERVER}]`;
  // Determine if this is an error message (use stderr) or normal operation (use stdout)
  const isError = message.includes("Error") || 
                  message.includes("error") || 
                  message.includes("Failed") || 
                  message.includes("Connection error") ||
                  message.includes("WebSocket closed") ||
                  (message.includes("exited") && !message.includes("code=0"));
  
  if (DEBUG_MODE) {
    const timestamp = new Date().toISOString();
    // Truncate large messages for readability
    const msg = message.length > 120 ? `${message.substring(0, 120)}...` : message;
    if (isError) {
      console.error(`${timestamp} ${prefix} ${msg}`, ...args);
    } else {
      // Use stdout for normal operations (ping/pong, connections, etc.)
      console.log(`${timestamp} ${prefix} ${msg}`, ...args);
    }
  } else {
    // Only log important events (errors, connection status, fatal errors)
    // Skip verbose connection/reconnection messages
    const importantMessages = [
      "Failed",
      "Error",
      "error",
      "Starting MCP bridge",
      "Successfully connected",
      "WebSocket closed",
      "Terminating",
      "shutting down"
    ];
    if (importantMessages.some(keyword => message.includes(keyword))) {
      if (isError) {
        console.error(`${prefix} ${message}`, ...args);
      } else {
        // Use stdout for successful operations
        console.log(`${prefix} ${message}`, ...args);
      }
    }
  }
}

/**
 * Detailed error logging function
 * Always logs full error details regardless of DEBUG_MODE for better debugging
 */
function logError(title: string, error: any, context?: Record<string, any>): void {
  const prefix = `[${TARGET_SERVER}]`;
  const timestamp = new Date().toISOString();
  const separator = "=".repeat(80);
  
  console.error(`\n${separator}`);
  console.error(`${timestamp} ${prefix} ❌ ERROR: ${title}`);
  console.error(separator);
  
  if (error instanceof Error) {
    console.error(`Message: ${error.message}`);
    if (error.stack) {
      console.error(`Stack trace:\n${error.stack}`);
    }
    // Log additional error properties if they exist
    if ('code' in error) {
      console.error(`Error code: ${error.code}`);
    }
    if ('errno' in error) {
      console.error(`Error number: ${error.errno}`);
    }
    if ('syscall' in error) {
      console.error(`System call: ${error.syscall}`);
    }
  } else {
    console.error(`Error details: ${JSON.stringify(error, null, 2)}`);
  }
  
  if (context) {
    console.error(`\nContext:`);
    console.error(JSON.stringify(context, null, 2));
  }
  
  console.error(separator + "\n");
}

/**
 * Sleep utility
 */
function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/**
 * Terminate child process gracefully
 */
function terminateProcess(process: ChildProcess | null): void {
  if (!process || process.killed) return;
  
  log("Terminating server process");
  process.kill("SIGTERM");
  
  // Force kill after 5 seconds if still alive
  setTimeout(() => {
    if (!process.killed) {
      log("Force killing server process");
      process.kill("SIGKILL");
    }
  }, 5000);
}

/**
 * Spawn stdio MCP server as child process
 */
function spawnServerProcess(): ChildProcess {
  // Determine command based on environment
  // Use tsx for TypeScript execution, or node for production builds
  const isProduction: boolean = process.env.NODE_ENV === "production";
  const serverPath: string = isProduction 
    ? join(__dirname, "index.js")
    : join(__dirname, "index.ts");
  
  let serverCmd: string;
  let serverArgs: string[];
  
  if (isProduction) {
    // Production: use node directly
    serverCmd = "node";
    serverArgs = [serverPath];
  } else {
    // Development: find tsx executable
    // Try to find tsx in node_modules/.bin first
    const tsxBinName = process.platform === "win32" ? "tsx.cmd" : "tsx";
    const tsxPath = join(process.cwd(), "node_modules", ".bin", tsxBinName);
    
    if (existsSync(tsxPath)) {
      // Use local tsx executable directly
      // On Windows, .cmd files need shell execution
      serverCmd = tsxPath;
      serverArgs = [serverPath];
    } else {
      // Fallback: use npx via shell (more reliable cross-platform)
      if (process.platform === "win32") {
        serverCmd = "cmd";
        serverArgs = ["/c", "npx", "tsx", serverPath];
      } else {
        serverCmd = "sh";
        serverArgs = ["-c", `npx tsx "${serverPath}"`];
      }
    }
  }
  
  if (DEBUG_MODE) {
    log(`Starting server process: ${serverCmd} ${serverArgs.join(" ")}`);
  }
  
  // Spawn child process WITHOUT MCP_ENDPOINT so it runs in stdio mode, not bridge mode
  // This prevents infinite recursion: bridge spawns child → child would run bridge → spawns another child...
  // Set an explicit flag so the child knows it was spawned by bridge (even if PM2 env vars are inherited)
  const childEnv = { ...process.env };
  delete childEnv.MCP_ENDPOINT;
  delete childEnv.MCP_ENDPOINTS; // Also remove if it exists
  // Set flag to indicate this process was spawned by bridge
  // This must be checked FIRST in index.ts before PM2 detection to prevent recursion
  childEnv.MCP_SPAWNED_BY_BRIDGE = "true";
  
  // Use shell execution for .cmd files on Windows or when using cmd/sh fallback
  const needsShell = process.platform === "win32" && 
    (!isProduction && (serverCmd.endsWith(".cmd") || serverCmd === "cmd"));
  
  const childProc = spawn(serverCmd, serverArgs, {
    stdio: ["pipe", "pipe", "pipe"], // stdin, stdout, stderr are all piped
    env: childEnv, // Environment without MCP_ENDPOINT
    cwd: process.cwd(),
    shell: needsShell, // Use shell for Windows .cmd files
  });
  
  // Handle process exit
  childProc.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
    if (DEBUG_MODE) {
      log(`Server process exited: code=${code}, signal=${signal}`);
    }
    // Only close WebSocket if process exited with error code
    // Normal exits (code 0 or signal) shouldn't trigger WebSocket close
    // This prevents infinite reconnection loops when child exits normally
    if (code !== null && code !== 0 && ws && ws.readyState === WebSocket.OPEN) {
      logError(
        "Server process exited with error code",
        new Error(`Process exited with code ${code}${signal ? ` (signal: ${signal})` : ""}`),
        {
          exitCode: code,
          signal: signal,
          command: serverCmd,
          args: serverArgs,
          cwd: process.cwd(),
          platform: process.platform,
          nodeEnv: process.env.NODE_ENV,
        }
      );
      log("Closing WebSocket due to server process error exit");
      ws.close();
    }
    childProcess = null;
  });
  
  // Handle process errors
  childProc.on("error", (error: Error) => {
    logError("Failed to spawn server process", error, {
      command: serverCmd,
      args: serverArgs,
      cwd: process.cwd(),
      platform: process.platform,
      nodeEnv: process.env.NODE_ENV,
      needsShell: needsShell,
      tsxPath: !isProduction ? join(process.cwd(), "node_modules", ".bin", (process.platform === "win32" ? "tsx.cmd" : "tsx")) : undefined,
    });
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });
  
  // Forward stderr to console (logging and errors)
  childProc.stderr?.setEncoding("utf-8");
  childProc.stderr?.on("data", (data: string) => {
    console.error(data);
  });
  
  // Set up stdout handler early to capture initialization logs
  // This will be replaced when WebSocket connects, but we need it for early logs
  childProc.stdout?.setEncoding("utf-8");
  let stdoutHandler: ((data: string) => void) | null = null;
  
  // Initial handler: log everything (for initialization phase)
  stdoutHandler = (data: string) => {
    const lines = data.toString().split("\n").filter((line) => line.trim());
    for (const line of lines) {
      // Log all lines during initialization (before WebSocket connects)
      console.log(line);
    }
  };
  
  childProc.stdout?.on("data", stdoutHandler);
  
  // Store reference so we can replace it later when WebSocket connects
  (childProc as any)._stdoutHandler = stdoutHandler;
  
  return childProc;
}

/**
 * Connect to WebSocket endpoint and spawn server process
 */
async function connectToServer(uri: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (DEBUG_MODE) {
      log(`Connecting to WebSocket server: ${uri.replace(/token=[^&]+/, "token=***")}`);
    }
    
    ws = new WebSocket(uri);
    
    ws.on("open", () => {
      log("Successfully connected to WebSocket server");
      
      // Spawn child process after WebSocket connection is established
      childProcess = spawnServerProcess();
      
      if (!childProcess.stdin || !childProcess.stdout) {
        const error = new Error("Failed to spawn server process: stdin/stdout not available");
        logError("Server process streams not available", error, {
          hasStdin: !!childProcess.stdin,
          hasStdout: !!childProcess.stdout,
          hasStderr: !!childProcess.stderr,
          killed: childProcess.killed,
          pid: childProcess.pid,
        });
        reject(error);
        return;
      }
      
      // Replace the initial stdout handler with one that filters MCP protocol messages
      // Remove all existing stdout listeners to avoid duplicates
      if (childProcess.stdout) {
        childProcess.stdout.removeAllListeners("data");
        // Set stdout encoding (if not already set)
        childProcess.stdout.setEncoding("utf-8");
      }
      
      // Pipe WebSocket messages → Stdio (inbound)
      ws!.on("message", (data: WebSocket.Data) => {
        try {
          const message = typeof data === "string" ? data : data.toString("utf-8");
          
          if (DEBUG_MODE) {
            const preview = message.length > 120 ? `${message.substring(0, 120)}...` : message;
            log(`<< ${preview}`);
          }
          
          if (childProcess?.stdin && !childProcess.stdin.destroyed) {
            childProcess.stdin.write(message + "\n");
          } else {
            throw new Error("Child process stdin is not available or destroyed");
          }
        } catch (error) {
          logError("Error handling WebSocket message", error, {
            messagePreview: typeof data === "string" ? data.substring(0, 200) : "binary data",
            messageLength: typeof data === "string" ? data.length : "unknown",
            hasChildProcess: !!childProcess,
            stdinAvailable: childProcess?.stdin && !childProcess.stdin.destroyed,
            wsReadyState: ws?.readyState,
          });
          // Continue processing (don't disconnect)
        }
      });
      
      // Pipe Stdio messages → WebSocket (outbound)
      childProcess.stdout.on("data", (data: string) => {
        try {
          const lines = data.toString().split("\n").filter((line) => line.trim());
          
          for (const line of lines) {
            // Check if it's a JSON-RPC message
            if (line.trim() && line.trim().startsWith("{") && ws && ws.readyState === WebSocket.OPEN) {
              try {
                // Validate it's JSON before sending
                JSON.parse(line);
                if (DEBUG_MODE) {
                  const preview = line.length > 120 ? `${line.substring(0, 120)}...` : line;
                  log(`>> ${preview}`);
                }
                ws.send(line);
              } catch (parseError) {
                // Not valid JSON - this is likely a console.log from initialization
                // Log it so we can see authentication and initialization messages
                console.log(line);
              }
            } else {
              // Not JSON - this is console.log output (initialization logs, etc.)
              // Log it so we can see what's happening
              console.log(line);
            }
          }
        } catch (error) {
          logError("Error sending to WebSocket", error, {
            dataPreview: data.toString().substring(0, 500),
            dataLength: data.length,
            wsReadyState: ws?.readyState,
            hasChildProcess: !!childProcess,
          });
          // Continue processing (don't kill process)
        }
      });
      
      // Reset reconnect state on successful connection
      reconnectAttempt = 0;
      backoff = INITIAL_BACKOFF;
      
      // DON'T resolve here - keep promise pending until WebSocket closes
      // This prevents connectWithRetry from immediately trying to reconnect
      
      // Handle WebSocket close - reject promise to trigger reconnection
      ws!.on("close", (code, reason) => {
        log(`WebSocket closed: code=${code}, reason=${reason.toString()}`);
        // Log detailed error if close was unexpected (not normal closure)
        if (code !== 1000 && code !== 1001) {
          logError(
            "WebSocket closed unexpectedly",
            new Error(`WebSocket closed with code ${code}: ${reason.toString()}`),
            {
              closeCode: code,
              reason: reason.toString(),
              reconnectAttempt: reconnectAttempt + 1,
              hasChildProcess: !!childProcess,
              childProcessPid: childProcess?.pid,
              childProcessKilled: childProcess?.killed,
              endpoint: uri.replace(/token=[^&]+/, "token=***"),
            }
          );
        }
        if (childProcess) {
          terminateProcess(childProcess);
          childProcess = null;
        }
        reject(new Error(`WebSocket closed: ${code}`));
      });
      
      // Handle WebSocket errors - reject promise to trigger reconnection
      ws!.on("error", (error) => {
        logError("WebSocket error", error, {
          reconnectAttempt: reconnectAttempt + 1,
          endpoint: uri.replace(/token=[^&]+/, "token=***"),
          hasChildProcess: !!childProcess,
          childProcessPid: childProcess?.pid,
          wsReadyState: ws?.readyState,
        });
        if (childProcess) {
          terminateProcess(childProcess);
          childProcess = null;
        }
        reject(error);
      });
    });
    
    ws.on("error", (error) => {
      logError("WebSocket connection error", error, {
        endpoint: uri.replace(/token=[^&]+/, "token=***"),
        reconnectAttempt: reconnectAttempt + 1,
      });
      reject(error);
    });
  });
}

/**
 * Connect with automatic retry and exponential backoff
 */
async function connectWithRetry(uri: string): Promise<void> {
  while (true) {
    try {
      if (reconnectAttempt > 0) {
        if (DEBUG_MODE) {
          log(`Waiting ${backoff}s before reconnection attempt ${reconnectAttempt}...`);
        }
        await sleep(backoff);
      }
      
      await connectToServer(uri);
      
      // If we get here, connection was established and is now closed
      // The rejection from connectToServer will be caught below
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      reconnectAttempt++;
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
      // Only log first 3 attempts to reduce spam
      if (DEBUG_MODE || reconnectAttempt <= 3) {
        log(`Connection error (attempt ${reconnectAttempt}): ${errorMsg}`);
      }
      
      // Cleanup before retry
      if (ws) {
        ws.removeAllListeners();
        ws = null;
      }
      if (childProcess) {
        terminateProcess(childProcess);
        childProcess = null;
      }
      
      // Continue loop to retry
    }
  }
}

/**
 * Main entry point
 */
async function main() {
  // Validate endpoint (should already be set from accounts.json, but double-check)
  if (!ENDPOINT) {
    console.error("❌ MCP_ENDPOINT is required");
    console.error("   Please configure an account with mcpEndpoint in config/accounts.json");
    console.error("   Example: { \"accounts\": [{ \"mcpEndpoint\": \"wss://api.xiaozhi.me/mcp/?token=...\", \"tokenPath\": \"~/.google-mcp/token.json\" }] }");
    process.exit(1);
  }
  
  // Validate WebSocket URL
  if (!ENDPOINT.startsWith("ws://") && !ENDPOINT.startsWith("wss://")) {
    console.error("❌ MCP_ENDPOINT must be a WebSocket URL (ws:// or wss://)");
    console.error(`   Current value: ${ENDPOINT}`);
    process.exit(1);
  }
  
  log(`Starting MCP bridge for ${TARGET_SERVER}`);
  log(`Endpoint: ${ENDPOINT.replace(/token=[^&]+/, "token=***")}`);
  log(`Debug mode: ${DEBUG_MODE}`);
  
  // Handle graceful shutdown
  process.on("SIGINT", () => {
    log("Received SIGINT, shutting down...");
    if (childProcess) {
      terminateProcess(childProcess);
    }
    if (ws) {
      ws.close();
    }
    process.exit(0);
  });
  
  process.on("SIGTERM", () => {
    log("Received SIGTERM, shutting down...");
    if (childProcess) {
      terminateProcess(childProcess);
    }
    if (ws) {
      ws.close();
    }
    process.exit(0);
  });
  
  // Start connection with retry
  await connectWithRetry(ENDPOINT);
}

// Start the bridge
main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});

