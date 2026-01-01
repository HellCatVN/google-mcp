# Google MCP Server - System Architecture

## Overview

Google MCP Server is a Model Context Protocol (MCP) server that provides seamless integration with Google services (Gmail, Calendar, Drive, Tasks) through OAuth 2.0 authentication.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         AI Client                                │
│                      (Claude/Cursor)                            │
└────────────────────────────┬────────────────────────────────────┘
                             │ MCP Protocol
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     MCP Server Layer                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Transport Adapters                                       │  │
│  │  ┌───────────┐  ┌────────────┐  ┌──────────────────┐    │  │
│  │  │  Stdio    │  │  HTTP      │  │  Bridge (WS)     │    │  │
│  │  │  (MCP)    │  │  (SSE/     │  │  (WebSocket      │    │  │
│  │  │           │  │   JSON)     │  │   Client)        │    │  │
│  │  └─────┬─────┘  └──────┬─────┘  └────────┬─────────┘    │  │
│  └────────┼───────────────┼─────────────────┼───────────────┘  │
│           │               │                 │                   │
│  ┌────────┴───────────────┴─────────────────┴───────────────┐  │
│  │              MCP Server Core (server-setup.ts)            │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  Tool Request Router                               │  │  │
│  │  │  - ListToolsRequestSchema                          │  │  │
│  │  │  - CallToolRequestSchema                           │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  OAuth Tools (No Auth Required)                    │  │  │
│  │  │  - google_oauth_refresh_tokens                     │  │  │
│  │  │  - google_oauth_reauthenticate                     │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  Service Initialization                            │  │  │
│  │  │  - createAuthClient()                              │  │  │
│  │  │  - Token refresh scheduler                         │  │  │
│  │  │  - Startup token check                             │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Handler Layer                                 │
│  ┌───────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Calendar  │  │  Gmail   │  │  Drive   │  │    Tasks     │   │
│  │ Handlers  │  │ Handlers │  │ Handlers │  │  Handlers    │   │
│  │           │  │          │  │          │  │              │   │
│  │ - set_    │  │ - list_  │  │ - list_  │  │ - set_       │   │
│  │   default │  │   emails │  │   files  │  │   default    │   │
│  │ - create_ │  │ - send_  │  │ - get_   │  │ - create_    │   │
│  │   event   │  │   email  │  │   content│  │   task       │   │
│  │ - get_    │  │ - down-  │  │ - create │  │ - complete   │   │
│  │   events  │  │   load_  │  │   file   │  │   task       │   │
│  └─────┬─────┘  └─────┬────┘  └─────┬────┘  └──────┬───────┘   │
└────────┼───────────────┼───────────────┼───────────────┼──────────┘
         │               │               │               │
         └───────────────┴───────────────┴───────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Service Layer                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ GoogleCalen- │  │  GoogleGmail │  │  GoogleDrive         │  │
│  │     dar      │  │              │  │                      │  │
│  │              │  │              │  │  - searchFiles       │  │
│  │ - list()     │  │ - listEmails │  │  - getFileContent    │  │
│  │ - create()   │  │ - sendEmail  │  │  - createFile        │  │
│  │ - update()   │  │ - down-      │  │  - updateFile        │  │
│  │ - delete()   │  │   loadAtts   │  │  - deleteFile        │  │
│  │ - findFree() │  │              │  │  - shareFile         │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
└─────────┼───────────────────┼───────────────────┼──────────────┘
          │                   │                   │
          └───────────────────┴───────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Authentication Layer                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  OAuth2 Client (utils/auth.ts)                           │  │
│  │                                                          │  │
│  │  - createAuthClient()                                    │  │
│  │  - refreshTokens()    ──────────┐                       │  │
│  │  - reauthenticate()              │                       │  │
│  │  - initiateOAuthFlow()           │                       │  │
│  │                                  │                       │  │
│  │  Error Handling:                 │                       │  │
│  │  - parseTokenRefreshError()  ────┘                       │  │
│  │  - classifyTokenError()                                  │  │
│  │  - Retry Logic (exponential backoff)                     │  │
│  │                                                          │  │
│  │  Token Management:                                       │  │
│  │  - loadTokensFromFile()                                  │  │
│  │  - saveTokensToFile()                                    │  │
│  │  - resolveTokenPath()                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Token Refresh Scheduler                                 │  │
│  │  - Interval: REFRESH_INTERVAL_MINUTES (default: 50)      │  │
│  │  - Pre-refresh expiry check (10 min threshold)           │  │
│  │  - Token state logging                                   │  │
│  │  - Discord notifications (success/failure)               │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Google APIs                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Gmail API    │  │ Calendar API │  │ Drive API    │  ...     │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. MCP Server Layer (`server-setup.ts`)

**Responsibilities:**
- Initialize MCP protocol handlers
- Route tool requests to appropriate handlers
- Manage service initialization
- Coordinate token refresh scheduling

**Key Features:**
- Transport-agnostic design (stdio, HTTP, WebSocket)
- Lazy initialization (services init on first tool call)
- OAuth tools bypass authentication requirement
- Automatic token refresh on startup and scheduled intervals

### 2. Handler Layer (`handlers/`)

**Calendar Handlers** (`handlers/calendar.ts`):
- `handleCalendarSetDefault` - Set default calendar
- `handleCalendarListCalendars` - List all calendars
- `handleCalendarCreateEvent` - Create new event
- `handleCalendarGetEvents` - List events with filters
- `handleCalendarGetEvent` - Get specific event
- `handleCalendarUpdateEvent` - Update existing event
- `handleCalendarDeleteEvent` - Delete event
- `handleCalendarFindFreeTime` - Find available slots

**Gmail Handlers** (`handlers/gmail.ts`):
- `handleGmailListLabels` - List all labels
- `handleGmailListEmails` - List emails with query
- `handleGmailGetEmail` - Get specific email
- `handleGmailGetEmailByIndex` - Get email by index
- `handleGmailSendEmail` - Send with attachments
- `handleGmailDraftEmail` - Create draft
- `handleGmailDeleteEmail` - Delete email
- `handleGmailModifyLabels` - Add/remove labels
- `handleGmailDownloadAttachments` - Download all attachments

**Drive Handlers** (`handlers/drive.ts`):
- `handleDriveListFiles` - List with search/sort
- `handleDriveGetFileContent` - Read file content
- `handleDriveCreateFile` - Create new file
- `handleDriveUpdateFile` - Update existing file
- `handleDriveDeleteFile` - Trash or permanent delete
- `handleDriveShareFile` - Set permissions

**Tasks Handlers** (`handlers/tasks.ts`):
- `handleTasksSetDefaultList` - Set default tasklist
- `handleTasksListTasklists` - List all tasklists
- `handleTasksListTasks` - List tasks with filters
- `handleTasksGetTask` - Get specific task
- `handleTasksCreateTask` - Create new task
- `handleTasksUpdateTask` - Update task
- `handleTasksCompleteTask` - Mark complete
- `handleTasksDeleteTask` - Delete task
- `handleTasksCreateTasklist` - Create tasklist
- `handleTasksDeleteTasklist` - Delete tasklist

**OAuth Handlers** (`handlers/oauth.ts`):
- `handleOauthRefreshTokens` - Manual token refresh
- `handleOauthReauthenticate` - Full re-authentication

### 3. Service Layer (`utils/`)

**GoogleCalendar** (`utils/calendar.ts`):
- Wrapper around Google Calendar API v3
- Methods: list(), create(), update(), delete(), findFreeTime()

**GoogleGmail** (`utils/gmail.ts`):
- Wrapper around Gmail API v1
- Methods: listEmails(), sendEmail(), downloadAttachments()

**GoogleDrive** (`utils/drive.ts`):
- Wrapper around Drive API v3
- Methods: searchFiles(), getFileContent(), createFile()

**GoogleTasks** (`utils/tasks.ts`):
- Wrapper around Tasks API v1
- Methods: listTasklists(), createTask(), completeTask()

### 4. Authentication Layer (`utils/auth.ts`)

**Core Functions:**

| Function | Purpose |
|----------|---------|
| `createAuthClient()` | Initialize OAuth2 client, load tokens, set up auto-refresh |
| `refreshTokens()` | Proactive token refresh with error handling and retry logic |
| `reauthenticate()` | Full OAuth flow re-authentication |
| `initiateOAuthFlow()` | Start OAuth server, open browser |
| `handleOAuthCallback()` | Process OAuth callback, save tokens |

**Error Handling:**

| Function | Purpose |
|----------|---------|
| `parseTokenRefreshError()` | Extract error details from Google API response |
| `classifyTokenError()` | Classify errors (invalid_grant, invalid_client, network, rate_limit) |
| `sendDiscordNotification()` | Send alerts to Discord webhook |

**Token Management:**

| Function | Purpose |
|----------|---------|
| `loadTokensFromFile()` | Load tokens from JSON file with path resolution |
| `saveTokensToFile()` | Save tokens to JSON file with directory creation |
| `resolveTokenPath()` | Handle ~ expansion, relative/absolute paths |

## Token Refresh Flow

```
┌──────────────────────────────────────────────────────────────┐
│  Server Startup                                              │
├──────────────────────────────────────────────────────────────┤
│  1. Initialize authentication (createAuthClient)             │
│  2. Load existing tokens                                     │
│  3. Check token expiry (within 10 min)                       │
│  4. If expiring: refreshTokens()                             │
│  5. Start scheduler (every REFRESH_INTERVAL_MINUTES)         │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  Scheduled Refresh (every 50 min default)                    │
├──────────────────────────────────────────────────────────────┤
│  refreshTokens() called:                                     │
│  1. Load tokens from file                                    │
│  2. Check expiry_date (skip if >10 min remaining)           │
│  3. Log token state (age, expiry, has refresh token)        │
│  4. Attempt refresh (OAuth API call)                         │
│  5. On success: Save tokens, Discord success notification   │
│  6. On error: Classify error, retry or notify                │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  Error Handling & Retry                                      │
├──────────────────────────────────────────────────────────────┤
│  Recoverable errors (network, rate_limit):                   │
│  - Retry up to 2 times                                       │
│  - Exponential backoff: 5s, 10s (max 30s)                    │
│  - Log retry attempts                                        │
│                                                              │
│  Non-recoverable errors (invalid_grant, invalid_client):     │
│  - No retries                                                │
│  - Discord failure notification with action guidance         │
│  - Throw error with context                                  │
└──────────────────────────────────────────────────────────────┘
```

## Transport Modes

### 1. Stdio Mode (Default for MCP Clients)
- Used when spawned by AI clients (Claude, Cursor)
- Communicates via stdin/stdout
- Automatic session management

### 2. HTTP Mode
```json
{
  "mcpServers": {
    "google-mcp": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```
- Endpoints:
  - `GET /health` - Health check
  - `GET /mcp` - Session info
  - `POST /mcp` - JSON-RPC endpoint
  - `DELETE /mcp` - End session

### 3. Bridge Mode (WebSocket Client)
- Connects to external WebSocket endpoint
- Configured via `config/accounts.json`
- Spawns MCP server in stdio mode

## Configuration

### Accounts Configuration (`config/accounts.json`)
```json
{
  "accounts": [
    {
      "mcpEndpoint": "wss://api.example.com/mcp?token=xxx",
      "tokenPath": "~/.google-mcp/tokens.json",
      "http": true
    }
  ]
}
```

### Environment Variables (`.env`)
```env
# OAuth credentials
GOOGLE_OAUTH_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=xxx

# Token refresh (optional)
REFRESH_INTERVAL_MINUTES=50

# Discord webhook (optional)
DISCORD_HOOK=https://discord.com/api/webhooks/xxx

# Custom paths (optional)
GOOGLE_ACCOUNTS_CONFIG=config/accounts.json
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3001
```

## Data Flow Example: Sending an Email

```
User Request
    │
    ▼
AI Client (Claude)
    │ "Send email to jane@example.com"
    │
    ▼
MCP Protocol (JSON-RPC)
    │
    ▼
Server Tool Router (server-setup.ts)
    │ Routes to google_gmail_send_email
    │
    ▼
Gmail Handler (handlers/gmail.ts)
    │ Validates args
    │ Calls googleGmailInstance.sendEmail()
    │
    ▼
Gmail Service (utils/gmail.ts)
    │ Uses google.gmail API
    │
    ▼
Google OAuth2 Client
    │ Auto-refreshes token if expired
    │ Includes Bearer token in request
    │
    ▼
Gmail API (googleapis)
    │ Sends email via Gmail REST API
    │
    ▼
Response
    │ Success/failure message
    │
    ▼
User receives confirmation
```

## Error Handling Strategy

### 1. Authentication Errors
- **invalid_client**: Check environment variables
- **invalid_grant**: Re-authenticate via OAuth flow
- **network errors**: Automatic retry with backoff
- **rate_limit**: Automatic retry with backoff

### 2. API Errors
- Caught at handler level
- Returned to user as error messages
- No crash, server continues running

### 3. Token Refresh Failures
- Logged with full context
- Discord notification sent (if configured)
- Recoverable errors retried automatically
- Non-recoverable errors require manual intervention

## Security Considerations

1. **Token Storage**: Tokens stored in local JSON file (not in code)
2. **Credentials in .env**: OAuth credentials never committed to git
3. **Token Refresh**: Automatic refresh prevents token exposure
4. **OAuth Flow**: Uses secure redirect URI (localhost)
5. **Session Management**: HTTP mode uses auto-generated session IDs

## Performance Optimizations

1. **Lazy Initialization**: Services created only when needed
2. **Token Caching**: Tokens stored locally, minimal API calls
3. **Smart Refresh**: Only refreshes when token within 10 min of expiry
4. **Connection Reuse**: HTTP client keeps connections alive
5. **Exponential Backoff**: Prevents API rate limiting on retries

## Monitoring & Observability

### Logging Levels
- **Info**: Token refresh, service initialization
- **Warn**: Recoverable errors, retry attempts
- **Error**: Non-recoverable errors, authentication failures

### Discord Notifications
- Success: Token refreshed successfully
- Failure: Error type, code, description, action required
- Color-coded: Green (success), Yellow (recoverable), Red/Orange (critical)

### Token State Logging
```json
{
  "tokenAgeMinutes": 55,
  "minutesUntilExpiry": 5,
  "hasRefreshToken": true,
  "systemTime": "2026-01-01T13:30:00.000Z",
  "expiryTime": "2026-01-01T14:30:00.000Z"
}
```

## Deployment Architectures

### 1. Local Development
```bash
pnpm run dev  # HTTP mode on localhost:3000
```

### 2. Production (PM2)
```bash
pm2 start ecosystem.config.cjs
```

### 3. Docker
```bash
docker-compose up
```

### 4. Systemd Service
```bash
sudo systemctl start google-mcp
```

### 5. Bridge Mode (Cloud)
```bash
pnpm run bridge  # Connects to WebSocket endpoint
```
