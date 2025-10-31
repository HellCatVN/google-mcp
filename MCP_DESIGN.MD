## WebSocket MCP Design for Xiaoyu (ESP32‑S3)

This note outlines how to implement an MCP client over WebSocket for Xiaoyu devices (ESP32‑S3). It focuses on a lean JSON‑RPC over WebSocket transport compatible with the Xiaozhi MCP endpoint and the local MCP stdio servers bridged by `python/mcp_pipe.py`.

### Goals

* Minimal, robust MCP client for ESP32‑S3 constraints (RAM/flash/CPU).
* Reliable connection to Xiaozhi MCP endpoint via WebSocket (TLS).
* Stream requests/responses incrementally (no large buffers).
* Auto‑reconnect with exponential backoff and heartbeat.
* Simple security model (Bearer token or signed header when available).

## Architecture

* ESP32‑S3 runs a WebSocket JSON‑RPC client that connects to Xiaozhi MCP endpoint `MCP_ENDPOINT`.
* On developer machines, local MCP servers run over stdio; `python/mcp_pipe.py` bridges stdio <-> WebSocket to the same Xiaozhi endpoint, multiplexing tools.

### Data Flow

1. ESP32 connects to `wss://<host>/mcp` (example) with auth headers.
2. On connect, ESP32 sends `initialize` message (JSON‑RPC). Server responds with capabilities.
3. ESP32 can:
   * receive `toolCall` requests and execute device tools
   * send `toolCall` requests to remote tools (e.g., exchange rate) via the pipe/server
4. Heartbeats monitor liveness; backoff handles reconnect.

## Transport & Protocol

### WebSocket

* Use binary‑safe UTF‑8 text frames (JSON). Avoid fragmentation at app layer.
* Recommended ESP32 libs: `esp_websocket_client` (ESP‑IDF) with TLS.
* TLS: validate server cert if possible; allow pinned cert or CA store when space permits.

### JSON‑RPC 2.0 Skeleton

* Envelope:
  * `"jsonrpc": "2.0"`
  * `"id"`: number or string for requests/responses
  * `"method"`: e.g., `initialize`, `tool.call`, `ping`
  * `"params"`: request payload
  * `"result"` / `"error"`: response payload

Minimal methods:
* `initialize` → `{ client: "xiaoyu-esp32", version: "x.y.z", capabilities: {...} }`
* `ping` / `pong` → health check
* `tool.call` → invoke a tool; params: `{ name, arguments }`

Example `tool.call` request:
```json
{
  "jsonrpc": "2.0",
  "id": 101,
  "method": "tool.call",
  "params": {
    "name": "get_latest_usd_vnd",
    "arguments": {}
  }
}
```

Example `tool.call` response:
```json
{
  "jsonrpc": "2.0",
  "id": 101,
  "result": {
    "success": true,
    "rate": { "fromCurrency": "USD", "toCurrency": "VND", "buyRate": 26079, "sellRate": 26349 }
  }
}
```

## Connection Management

### Backoff

* Exponential backoff: start 1s, double up to 10 min (match `mcp_pipe.py`).
* Jitter (±15%) to avoid thundering herd on mass reconnect.

### Heartbeat

* Send `ping` every 20–30s; expect `pong` within 10s.
* If no `pong`, close and trigger reconnect.

### Framing & Memory

* Stream read into a ring buffer (2–8 KB) and parse incrementally.
* Use a small JSON tokenizer (e.g., jsmn or cJSON with incremental feed) to avoid full‑message copies.
* Enforce max message size (e.g., 64 KB) and reject larger messages.

## Security

* Auth headers: `Authorization: Bearer <token>` when provided by endpoint.
* Store token in NVS; support rotation via `initialize` response or config message.
* Time sync (SNTP) recommended for TLS validation and logs.

## Tool Execution on ESP32

Optional, if ESP32 exposes device tools (e.g., sensors):

* Maintain a registry `{ toolName → handler }`.
* On inbound `tool.call`, validate `name`, parse `arguments`, run handler, return JSON result.
* Keep handlers non‑blocking; use task offloads for long operations; return progress via notifications if supported.

## Error Handling

* Transport errors: close + backoff.
* JSON parse errors: respond with JSON‑RPC error `-32700` (Parse error) when possible.
* Method not found: `-32601`.
* Invalid params: `-32602`.
* Tool failures: `result: { success: false, error: "..." }` or JSON‑RPC `error` with code.

## Configuration

* `MCP_ENDPOINT`: WebSocket URL from Xiaozhi console.
* Optional headers (if required by endpoint).
* Persist in NVS; allow OTA update via control channel.

## Testing Strategy

* Local loop: run `python/mcp_pipe.py` to proxy local stdio servers (`exchange_rate_server.py`, `gold_price_server.py`) to the endpoint.
* Simulate ESP32 with a desktop WebSocket client first (easier logging), then port to ESP‑IDF.
* Validate:
  * Connect / Reconnect / Heartbeat
  * `initialize` handshake
  * `tool.call` to `get_latest_usd_vnd` and `get_latest_gold_price`
  * Large payload rejection and backpressure

## ESP‑IDF Implementation Hints

* Use `esp_websocket_client` with TLS; create dedicated FreeRTOS task for the client.
* Two queues: outbound JSON‑RPC requests and inbound parsed messages.
* JSON: `cJSON` is available; consider `jsmn` for lower footprint.
* Logging: gate DEBUG logs behind Kconfig; truncate payload logs.
* Watchdog: feed during long waits; avoid blocking network task.

## References

* Internal implementation notes and patterns in this repository (see `python/mcp_pipe.py`).


