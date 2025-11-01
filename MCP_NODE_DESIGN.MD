## WebSocket MCP Bridge Design for Node.js/TypeScript

This document outlines how to implement an MCP WebSocket bridge in Node.js/TypeScript that connects stdio-based MCP servers to WebSocket endpoints (like the Xiaozhi MCP endpoint). This implementation is similar to `python/mcp_pipe.py` but built for the Node.js ecosystem.

### Goals

* Bridge stdio-based MCP servers to WebSocket endpoints
* Automatic reconnection with exponential backoff
* Support both development (TypeScript via tsx) and production (compiled JavaScript) modes
* Bidirectional message piping between WebSocket and stdio
* Robust error handling and process management
* Environment-based configuration via `.env` files

## Architecture

The bridge (`node/src/bridge.ts`) acts as a transparent proxy:

1. **WebSocket Client**: Connects to the Xiaozhi MCP endpoint (`MCP_ENDPOINT`)
2. **Stdio Server Spawner**: Spawns the local MCP server (`node/src/index.ts`) as a child process
3. **Bidirectional Pipe**: Routes messages between WebSocket and the stdio server process

```
┌─────────────┐         ┌──────────┐         ┌──────────────┐
│  WebSocket  │◄───────►│  Bridge  │◄───────►│ Stdio Server │
│   Endpoint  │         │ (bridge) │         │  (index.ts)  │
└─────────────┘         └──────────┘         └──────────────┘
                             │
                             │ spawns
                             ▼
                    ┌─────────────────┐
                    │ Child Process    │
                    │ (tsx/node index) │
                    └─────────────────┘
```

### Data Flow

1. Bridge connects to `wss://api.xiaozhi.me/mcp/?token=...`
2. Bridge spawns stdio MCP server as child process
3. Messages flow bidirectionally:
   - **WebSocket → Stdio**: WebSocket messages are written to child process stdin
   - **Stdio → WebSocket**: Child process stdout is sent to WebSocket
   - **Stderr**: Child process stderr is forwarded to console.error (logging)
4. On disconnect, bridge automatically reconnects with exponential backoff
5. On reconnect, a new child process is spawned

## Implementation Details

### Core Components

#### 1. WebSocket Connection

```typescript
import WebSocket from "ws";

const ws = new WebSocket(uri);

await new Promise<void>((resolve, reject) => {
  ws.on("open", () => {
    log("Successfully connected to WebSocket server");
    resolve();
  });
  ws.on("error", (error) => {
    reject(error);
  });
});
```

**Key Points:**
- Uses `ws` library for WebSocket support
- Supports WSS (secure WebSocket) endpoints
- Token is embedded in URL query string: `wss://host/mcp/?token=...`
- Connection is established before spawning child process

#### 2. Child Process Spawning

```typescript
import { spawn, ChildProcess } from "child_process";

// Development mode: use tsx to run TypeScript directly
// Production mode: use node to run compiled JavaScript
const serverCmd = process.env.NODE_ENV === "development" ? "tsx" : "node";
const serverArgs = process.env.NODE_ENV === "development"
  ? [join(__dirname, "index.ts")]
  : [join(__dirname, "index.js")];

childProcess = spawn(serverCmd, serverArgs, {
  stdio: ["pipe", "pipe", "pipe"],  // stdin, stdout, stderr are all piped
  env: { ...process.env },
  cwd: process.cwd(),
});
```

**Key Points:**
- **Development**: Spawns `tsx src/index.ts` (runs TypeScript directly)
- **Production**: Spawns `node dist/index.js` (runs compiled JavaScript)
- All stdio streams are piped for bidirectional communication
- Environment variables are inherited from parent process

#### 3. Message Piping

##### WebSocket → Stdio (Inbound)

```typescript
ws.on("message", (data: WebSocket.Data) => {
  const message = typeof data === "string" ? data : data.toString("utf-8");
  if (childProcess?.stdin && !childProcess.stdin.destroyed) {
    childProcess.stdin.write(message + "\n");
  }
});
```

- WebSocket messages are converted to UTF-8 strings
- Each message is appended with `\n` (stdio expects line-delimited JSON)
- Messages are written to child process stdin

##### Stdio → WebSocket (Outbound)

```typescript
childProcess.stdout.setEncoding("utf-8");
childProcess.stdout.on("data", (data: string) => {
  const lines = data.toString().split("\n").filter((line) => line.trim());
  for (const line of lines) {
    if (line.trim() && ws.readyState === WebSocket.OPEN) {
      ws.send(line);
    }
  }
});
```

- Child process stdout is split by newlines
- Each line is sent as a separate WebSocket message
- Only sends if WebSocket is in OPEN state

##### Stderr Handling

```typescript
childProcess.stderr.setEncoding("utf-8");
childProcess.stderr.on("data", (data: string) => {
  console.error(data);  // Forward to terminal
});
```

- Stderr is forwarded to console.error for logging
- Useful for debug output from the MCP server

## Connection Management

### Reconnection Strategy

```typescript
async function connectWithRetry(uri: string): Promise<void> {
  let reconnectAttempt = 0;
  let backoff = INITIAL_BACKOFF;  // 1 second

  while (true) {
    try {
      if (reconnectAttempt > 0) {
        log(`Waiting ${backoff}s before reconnection attempt ${reconnectAttempt}...`);
        await sleep(backoff);
      }
      await connectToServer(uri);
    } catch (error) {
      reconnectAttempt++;
      backoff = Math.min(backoff * 2, MAX_BACKOFF);  // Double up to 10 min
    }
  }
}
```

**Backoff Strategy:**
- Initial backoff: 1 second
- Maximum backoff: 600 seconds (10 minutes)
- Exponential: doubles on each retry
- Infinite retry loop (never gives up)

### Process Lifecycle

```typescript
// Handle WebSocket close
ws.on("close", (code, reason) => {
  log(`WebSocket closed: code=${code}, reason=${reason.toString()}`);
  terminateProcess(childProcess);
  throw new Error(`WebSocket closed: ${code}`);
});

// Handle process exit
childProcess.on("exit", (code, signal) => {
  log(`Server process exited: code=${code}, signal=${signal}`);
  if (ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
  throw new Error("Server process exited");
});
```

**Lifecycle Events:**
1. **WebSocket closes** → Terminate child process → Trigger reconnection
2. **Child process exits** → Close WebSocket → Trigger reconnection
3. **On reconnection** → Spawn new child process

### Graceful Shutdown

```typescript
function terminateProcess(process: ChildProcess): void {
  if (!process.killed) {
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
}
```

**Shutdown Sequence:**
1. Send `SIGTERM` for graceful shutdown
2. Wait 5 seconds
3. If still alive, send `SIGKILL` (force kill)

## Configuration

### Environment Variables

Configuration is loaded via `dotenv` from `.env` file:

```typescript
import dotenv from "dotenv";
dotenv.config();

const ENDPOINT = process.env.MCP_ENDPOINT || process.env.MCP_ENDPOINTS?.split(",")[0];
const DEBUG_MODE = process.env.DEBUG === "true" || process.env.NODE_ENV === "development";
const INITIAL_BACKOFF = 1;
const MAX_BACKOFF = 600;
const TARGET_SERVER = "calculator";
```

**Required:**
- `MCP_ENDPOINT`: WebSocket endpoint URL (e.g., `wss://api.xiaozhi.me/mcp/?token=...`)

**Optional:**
- `DEBUG`: Enable debug logging (`"true"` or `"false"`)
- `NODE_ENV`: Environment mode (`"development"` or `"production"`)
- `MCP_SERVER_NAME`: Server name (default: `"calculator"`)
- `MCP_SERVER_VERSION`: Server version (default: `"1.0.0"`)

### Example `.env` File

```env
# WebSocket Endpoint (required)
MCP_ENDPOINT=wss://api.xiaozhi.me/mcp/?token=eyJhbGci...

# Server Configuration
MCP_SERVER_NAME=calculator
MCP_SERVER_VERSION=1.0.0

# Debug Mode
DEBUG=true
NODE_ENV=development
```

## Error Handling

### Connection Errors

```typescript
try {
  await connectToServer(uri);
} catch (error) {
  const errorMsg = error instanceof Error ? error.message : String(error);
  log(`Connection closed (attempt ${reconnectAttempt}): ${errorMsg}`);
  backoff = Math.min(backoff * 2, MAX_BACKOFF);
}
```

- All connection errors trigger reconnection
- Error messages are logged with attempt number
- Backoff increases on each failure

### Message Handling Errors

```typescript
ws.on("message", (data: WebSocket.Data) => {
  try {
    // Handle message
  } catch (error) {
    log(`Error handling WebSocket message: ${error}`);
    // Continue processing (don't disconnect)
  }
});
```

- Message parsing errors are logged but don't disconnect
- Connection continues to process other messages

### Process Errors

```typescript
childProcess.stdout.on("data", (data: string) => {
  try {
    // Send to WebSocket
  } catch (error) {
    log(`Error sending to WebSocket: ${error}`);
    // Continue processing (don't kill process)
  }
});
```

- Output errors are logged but don't kill the process
- Process continues to run and produce output

## Logging

### Debug Mode

```typescript
function log(message: string, ...args: any[]) {
  const prefix = `[${TARGET_SERVER}]`;
  if (DEBUG_MODE) {
    console.error(`${new Date().toISOString()} ${prefix} ${message}`, ...args);
  } else {
    console.error(`${prefix} ${message}`, ...args);
  }
}
```

**Debug Features:**
- Timestamp prefix when DEBUG_MODE is enabled
- Message truncation for large payloads (120 chars preview)
- All logs go to stderr (stdout is reserved for JSON-RPC)

**Example Debug Output:**
```
2024-01-15T10:30:45.123Z [calculator] Connecting to WebSocket server: wss://api.xiaozhi.me/mcp/?token=***
2024-01-15T10:30:45.456Z [calculator] Successfully connected to WebSocket server
2024-01-15T10:30:45.789Z [calculator] Starting server process: tsx /path/to/index.ts
2024-01-15T10:30:46.012Z [calculator] << {"jsonrpc":"2.0","id":1,"method":"tools/list"}...
2024-01-15T10:30:46.345Z [calculator] >> {"jsonrpc":"2.0","id":1,"result":{"tools":[...]}}...
```

## Message Format

### JSON-RPC 2.0 Protocol

Messages are JSON-RPC 2.0 formatted strings, one per line:

**Request Example:**
```json
{"jsonrpc":"2.0","id":1,"method":"tools/list"}
```

**Response Example:**
```json
{"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"add","description":"Add two numbers"}]}}
```

**Tool Call Request:**
```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"add","arguments":{"a":10,"b":20}}}
```

**Tool Call Response:**
```json
{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\"success\":true,\"result\":30}"}]}}
```

## Signal Handling

```typescript
process.on("SIGINT", () => {
  log("Received SIGINT, shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  log("Received SIGTERM, shutting down...");
  process.exit(0);
});
```

- `SIGINT` (Ctrl+C): Graceful shutdown
- `SIGTERM`: Graceful shutdown (used by process managers)

## Development vs Production

### Development Mode

```bash
pnpm run dev
# Runs: NODE_ENV=development tsx src/bridge.ts
```

**Characteristics:**
- Uses `tsx` to run TypeScript directly (no compilation needed)
- Spawns `tsx src/index.ts` for the child process
- Debug logging enabled automatically
- Hot reload support (restart on file changes)

### Production Mode

```bash
pnpm run build
pnpm run bridge:prod
# Runs: node dist/bridge.js
```

**Characteristics:**
- Requires TypeScript compilation (`pnpm run build`)
- Uses compiled JavaScript from `dist/` directory
- Spawns `node dist/index.js` for the child process
- Optimized for performance

## Testing Strategy

### Manual Testing

1. **Setup Environment:**
   ```bash
   cp .env.example .env
   # Edit .env and add MCP_ENDPOINT
   ```

2. **Run Bridge:**
   ```bash
   pnpm run dev
   ```

3. **Verify Connection:**
   - Check logs for "Successfully connected to WebSocket server"
   - Verify child process is spawned
   - Tools should be registered on the endpoint

4. **Test Tool Calls:**
   - Use the Xiaozhi console to call tools
   - Verify responses flow through the bridge

### Integration Testing

1. **Test Reconnection:**
   - Kill WebSocket connection
   - Verify automatic reconnection
   - Verify child process is respawned

2. **Test Process Exit:**
   - Kill child process
   - Verify WebSocket closes
   - Verify reconnection spawns new process

3. **Test Message Flow:**
   - Send tool call through WebSocket
   - Verify it reaches stdio server
   - Verify response flows back

## Common Issues & Solutions

### Issue: "MCP_ENDPOINT environment variable is required"

**Solution:**
- Set `MCP_ENDPOINT` in `.env` file
- Or export: `export MCP_ENDPOINT=wss://...`

### Issue: "Failed to spawn server process"

**Solution:**
- Check that `tsx` is installed (dev mode) or `node dist/index.js` exists (prod mode)
- Verify file paths are correct
- Check file permissions

### Issue: Tools not registered

**Solution:**
- Verify WebSocket connection is established
- Check that child process is running
- Verify messages are flowing (enable DEBUG=true)
- Check that stdio server implements `tools/list` handler

### Issue: High memory usage

**Solution:**
- Reduce message buffer sizes
- Implement message size limits
- Clear buffers on disconnect

## Dependencies

### Required Packages

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0",
    "dotenv": "^16.4.5",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/ws": "^8.5.10",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3"
  }
}
```

**Key Libraries:**
- `ws`: WebSocket client library
- `dotenv`: Environment variable loading
- `@modelcontextprotocol/sdk`: MCP SDK (used by stdio server)
- `tsx`: TypeScript execution (for development)

## File Structure

```
node/
├── src/
│   ├── bridge.ts        # WebSocket bridge (this file)
│   └── index.ts         # Stdio MCP server
├── dist/                # Compiled JavaScript (production)
├── .env                 # Environment configuration (not in git)
├── .env.example         # Example environment file
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
└── README.md            # Usage documentation
```

## References

* Implementation: `node/src/bridge.ts`
* Stdio Server: `node/src/index.ts`
* Python equivalent: `python/mcp_pipe.py`
* ESP32 Design: `MCP_DESIGN.MD`

## Usage Examples

### Basic Usage

```bash
# Set endpoint
export MCP_ENDPOINT="wss://api.xiaozhi.me/mcp/?token=eyJhbGci..."

# Run bridge
pnpm run dev
```

### With .env File

```bash
# Create .env file
cat > .env << EOF
MCP_ENDPOINT=wss://api.xiaozhi.me/mcp/?token=eyJhbGci...
DEBUG=true
NODE_ENV=development
EOF

# Run bridge
pnpm run dev
```

### Production Deployment

```bash
# Build TypeScript
pnpm run build

# Run production bridge
pnpm run bridge:prod
```

### Process Manager (PM2)

```bash
# Install PM2
npm install -g pm2

# Run with PM2
MCP_ENDPOINT=wss://... pm2 start dist/bridge.js --name mcp-bridge

# Monitor
pm2 logs mcp-bridge
```

## Security Considerations

1. **Token Protection:**
   - Never commit `.env` file with tokens
   - Use `.gitignore` to exclude `.env`
   - Rotate tokens regularly

2. **TLS/SSL:**
   - Always use `wss://` (secure WebSocket)
   - Verify server certificates (default Node.js behavior)

3. **Process Isolation:**
   - Child process runs with inherited environment
   - Consider additional sandboxing for untrusted servers

4. **Message Validation:**
   - Consider validating JSON-RPC messages before forwarding
   - Implement message size limits to prevent DoS

## Future Enhancements

1. **Heartbeat/Ping:**
   - Implement WebSocket ping/pong for connection health
   - Detect stale connections faster

2. **Multiple Endpoints:**
   - Support multiple WebSocket endpoints (already partially implemented)
   - Load balancing across endpoints

3. **Health Checks:**
   - Periodic health checks for child process
   - Automatic restart on failure

4. **Metrics:**
   - Message count/rate metrics
   - Connection uptime tracking
   - Error rate monitoring

5. **Configuration File:**
   - Support JSON/YAML config files in addition to .env
   - Multiple server configurations

6. **TLS Options:**
   - Support custom CA certificates
   - Certificate pinning for enhanced security

