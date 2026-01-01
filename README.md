# Google MCP Tools

[![smithery badge](https://smithery.ai/badge/@vakharwalad23/google-mcp)](https://smithery.ai/server/@vakharwalad23/google-mcp)

This is a collection of Google-native tools (e.g., Gmail, Calendar) for the [MCP protocol](https://modelcontextprotocol.com/docs/mcp-protocol), designed to integrate seamlessly with AI clients like Claude or Cursor.

<a href="https://glama.ai/mcp/servers/@vakharwalad23/google-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@vakharwalad23/google-mcp/badge" alt="Google MCP server" />
</a>

## Quick Install

Click below for one-click install with `.mcpb`:

<a href="https://github.com/vakharwalad23/google-mcp/releases/download/v1.1.0/google-mcp.mcpb">
  <img width="280" alt="Install with Claude MCPB" src="https://github.com/user-attachments/assets/dfcf4fe2-d94d-4b6b-86e4-2794fea74fff" />
</a>

<details>
<summary>JSON configs</summary>

```json
{
  "mcpServers": {
    "google-mcp": {
      "command": "pnpm",
      "args": ["--global", "exec", "google-mcp@latest"],
      "env": {
        // OAuth credentials (still required in .env or here)
        "GOOGLE_OAUTH_CLIENT_ID": "<YOUR_CLIENT_ID>",
        "GOOGLE_OAUTH_CLIENT_SECRET": "<YOUR_CLIENT_SECRET>",
        // Token paths and endpoints are now configured in config/accounts.json
        // Use Service Account (alternative to OAuth)
        "GOOGLE_CLIENT_EMAIL": "<YOUR_SERVICE_ACCOUNT_EMAIL>",
        "GOOGLE_PRIVATE_KEY": "<YOUR_SERVICE_ACCOUNT_PRIVATE_KEY>",
        "GMAIL_USER_TO_IMPERSONATE": "<USER_TO_IMPERSONATE>"
      }
    }
  }
}
```

**Note**: Token paths and MCP endpoints are now configured in `config/accounts.json` instead of environment variables. See [Configuration](#configuration) section below.

</details>

## What's New

### 🆕 v1.2.0 - Enhanced Token Refresh & Error Handling

- **Intelligent Error Classification**:
  - Automatic error parsing from Google OAuth API responses
  - Error types: `invalid_grant`, `invalid_client`, `network`, `rate_limit`, `unknown`
  - Actionable guidance for each error type
  - Recoverable errors automatically retried with exponential backoff

- **Advanced Token Refresh**:
  - Pre-refresh token state logging (age, expiry, refresh_token presence)
  - Retry logic for network/rate_limit errors (1-2 retries, 5-30s backoff)
  - Discord notifications with error classification and specific actions
  - Smart refresh: only when token expires within 10 minutes
  - Configurable refresh interval (default: 50 min, minimum: 15 min)

- **New `config/accounts.json` Configuration**:
  - Token paths and MCP endpoints configured via `config/accounts.json`
  - Support for multiple accounts with shared token paths
  - Automatic mode detection (bridge vs HTTP server)

- **Improved Error Handling**:
  - Automatic OAuth flow when token file missing
  - Enhanced error messages with debug context
  - Port conflict resolution for OAuth server

### v1.1.0

### 🆕 Major Features

- **Complete Email Attachment Support**:
  - ✉️ **Send emails with attachments** from local files or Google Drive
  - 📥 **Download all email attachments** to local storage
  - 🔄 **Dual attachment sources**: Local file paths or Google Drive file IDs
  - 📁 **Smart file handling**: Automatic MIME type detection and filename sanitization

### 🔧 Enhanced Email Capabilities

- **Multi-source attachments**: Attach files from local storage or Google Drive in the same email
- **Custom filenames**: Override original filenames for attachments
- **File size validation**: Automatic 25MB Gmail limit enforcement
- **Cross-platform downloads**: Auto-detection of Downloads folder on Windows, macOS, and Linux
- **Conflict resolution**: Automatic file renaming to prevent overwrites

### 📁 New & Enhanced Tools

- `google_gmail_send_email`: Now supports attachments from local files and Google Drive
- `google_gmail_draft_email`: Create drafts with attachments
- `google_gmail_download_attachments`: Download all email attachments with customizable path

## Features

- **OAuth Management**:

  - Refresh expired access tokens automatically
  - Update tokens in the token file without re-authentication
  - Complete re-authentication with automated token cleanup
  - Maintain session continuity across long-running operations

- **Gmail**:

  - Send emails with multiple recipients (to, cc, bcc) and **attachments from local files or Google Drive**.
  - **Download all email attachments** to local storage with cross-platform support.
  - List emails with custom queries, labels, and result limits.
  - Read specific emails by ID with attachment information.
  - Manage labels (add, remove, list).
  - Draft and delete emails.

- **Calendar**:

  - List calendars and set a default calendar.
  - Create events with details (summary, start/end time, attendees, etc.).
  - List upcoming events with customizable filters.
  - Update or delete existing events.
  - Find free time slots for scheduling.

- **Drive**:

  - Filter with search queries
  - Sort by modification date or other criteria
  - Customize display count
  - View detailed file metadata
  - Read file content (text, docs, spreadsheets)
  - Create new files with specified content
  - Update existing files
  - Delete files (trash or permanent)
  - Share files with specific permissions

- **Tasks**:

  - View all task lists
  - Create new task lists
  - Delete existing task lists
  - Set default task list
  - List tasks with filters
  - View task details
  - Create tasks with title, notes, and due dates
  - Update task properties
  - Mark tasks as complete
  - Delete tasks

- **TODO Plans**:
  - Google Contacts: Search and manage contacts.
  - And Many More...

You can chain commands for workflows, e.g.:

"List my unread emails, draft a reply to the latest one, and schedule a follow-up meeting tomorrow at 2 PM."

## OAuth Token Management

The server includes built-in OAuth token management to handle expired access tokens gracefully:

- **Automatic Token Refresh**: When access tokens expire, you can refresh them without going through the full OAuth flow again
- **Complete Re-authentication**: Automatically handle cases where refresh tokens are invalid or expired
- **Persistent Storage**: Refreshed tokens are automatically saved to your configured token file path
- **Session Continuity**: All Google services are re-initialized with fresh tokens after refresh
- **Intelligent Error Handling**: Automatic error classification and retry logic for recoverable errors
- **Discord Notifications**: Real-time alerts for token refresh status and failures (optional)

### Error Types & Actions

| Error Type | Description | Recoverable | Automatic Action |
|------------|-------------|-------------|------------------|
| `invalid_grant` | Token expired or revoked | No | Requires re-authentication |
| `invalid_client` | Incorrect OAuth credentials | No | Check `.env` credentials |
| `network` | Network connectivity failure | Yes | Retry with 5-30s backoff |
| `rate_limit` | Too many API requests | Yes | Retry with exponential backoff |
| `unknown` | Unclassified error | No | Check logs for details |

### Discord Notifications

Configure `DISCORD_HOOK` in `.env` to receive real-time alerts:

**Success Example:**
```
✅ Token Refresh Successful
OAuth tokens have been refreshed successfully.

Next expiry: 2026-01-01 14:30:00
Time remaining: 60 minutes
```

**Failure Example:**
```
⚠️ Token Refresh Failed: invalid_grant
Error Type: invalid_grant
Error Code: invalid_grant
Details: Token has been expired
Recoverable: No

Action Required: Re-authenticate via OAuth flow
```

### Refreshing Tokens

If you encounter authentication errors or want to proactively refresh your tokens, simply ask:

```
Refresh my Google OAuth tokens
```

This will:

1. Use your stored refresh token to get new access tokens
2. Update the token file with the new credentials
3. Re-initialize all Google services with fresh authentication
4. Show you the new token expiration time

### Complete Re-authentication

If you get `invalid_grant` errors or your refresh token has expired, you can start fresh:

```
Re-authenticate my Google account
```

This automated process will:

1. **Delete existing tokens** from your token file
2. **Start OAuth server** to handle the callback
3. **Open browser** for fresh authentication
4. **Save new tokens** automatically
5. **Re-initialize services** with fresh credentials

You'll only need to click "Allow" in the browser - everything else is automated!

**Note**: If you don't have a valid refresh token, you'll need to go through the initial OAuth authentication flow again.

**For detailed error handling documentation, see [docs/oauth-error-handling.md](docs/oauth-error-handling.md)**

### Manual Installation

1. Prerequisites:

   - Install pnpm:

   ```bash
   npm install -g pnpm  # Install pnpm globally
   # Or using Homebrew on macOS/Linux:
   # brew install pnpm
   ```

2. Set Up OAuth:

   - Create a Google Cloud project in the [Google Cloud Console](https://console.cloud.google.com/).
   - Set up OAuth 2.0 credentials (Client ID, Client Secret).
   - Choose the type Desktop app.
   - If using test mode, add your email to the test users list.
   - Make sure to enable API access for desired services (Gmail, Calendar, Drive etc.).

3. Configure Environment Variables:

   Create a `.env` file in the project root with your OAuth credentials:

   ```env
   GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
   ```

   **Note**: Token paths and MCP endpoints are no longer configured in `.env`. They are now managed via `config/accounts.json` (see step 4).

4. Configure Accounts:

   Create `config/accounts.json` with your account configuration:

   ```json
   {
     "accounts": [
       {
         "mcpEndpoint": "wss://api.xiaozhi.me/mcp/?token=your-token",
         "tokenPath": "~/.google-mcp/tokens-user1.json",
         "http": true
       }
     ]
   }
   ```

   **Account Configuration Options:**
   - `mcpEndpoint` (optional): WebSocket endpoint for bridge mode. If set, the server runs in bridge mode.
   - `tokenPath` (required): Path to store OAuth tokens. Supports `~` for home directory.
   - `http` (optional): Set to `true` for exactly one account if you want HTTP server mode (when no `mcpEndpoint` is set).

   **Examples:**
   
   **Bridge Mode** (connecting to external endpoint):
   ```json
   {
     "accounts": [
       {
         "mcpEndpoint": "wss://api.xiaozhi.me/mcp/?token=your-token",
         "tokenPath": "~/.google-mcp/token.json"
       }
     ]
   }
   ```

   **HTTP Server Mode**:
   ```json
   {
     "accounts": [
       {
         "tokenPath": "~/.google-mcp/token.json",
         "http": true
       }
     ]
   }
   ```

   **Multiple Accounts** (same token path, different endpoints):
   ```json
   {
     "accounts": [
       {
         "mcpEndpoint": "wss://api.xiaozhi.me/mcp/?token=token1",
         "tokenPath": "~/.google-mcp/tokens-user1.json",
         "http": true
       },
       {
         "mcpEndpoint": "wss://api.xiaozhi.me/mcp/?token=token2",
         "tokenPath": "~/.google-mcp/tokens-user1.json"
       }
     ]
   }
   ```

5. Authenticate:
   - The first time you run the server, it will open a browser for OAuth authentication if the token file doesn't exist.
   - Follow the prompts to grant access, and tokens will be saved to the `tokenPath` specified in `accounts.json`.
   - The OAuth flow will automatically trigger when needed.

## Usage

Now, ask Claude to use the `google-mcp` tool.

```
Send an email to jane.doe@example.com with the subject "Meeting Notes" and body "Here are the notes from today."
```

```
List my upcoming calendar events for the next 3 days.
```

```
Create a calendar event titled "Team Sync" tomorrow at 10 AM for 1 hour.
```

```
Refresh my Google OAuth tokens
```

```
Re-authenticate my Google account
```

## Configuration

### Accounts Configuration (`config/accounts.json`)

The server uses `config/accounts.json` to manage multiple accounts, token paths, and endpoints. This replaces the need for `GOOGLE_OAUTH_TOKEN_PATH` and `MCP_ENDPOINT` environment variables.

**File Location**: `config/accounts.json` (or set `GOOGLE_ACCOUNTS_CONFIG` to a custom path)

**Structure**:
```json
{
  "accounts": [
    {
      "mcpEndpoint": "wss://api.xiaozhi.me/mcp/?token=your-token",
      "tokenPath": "~/.google-mcp/token.json",
      "http": true
    }
  ]
}
```

**Fields**:
- `mcpEndpoint` (optional): WebSocket endpoint URL for bridge mode. If provided, the server runs in bridge mode.
- `tokenPath` (required): Path to store OAuth tokens. Supports:
  - `~` for home directory (e.g., `~/.google-mcp/token.json`)
  - Relative paths (resolved from project root)
  - Absolute paths
- `http` (optional): Set to `true` for exactly one account to enable HTTP server mode when no `mcpEndpoint` is set.

**Multiple Accounts**:
You can configure multiple accounts with different endpoints but share the same token path:
```json
{
  "accounts": [
    {
      "mcpEndpoint": "wss://api.xiaozhi.me/mcp/?token=token1",
      "tokenPath": "~/.google-mcp/tokens-user1.json",
      "http": true
    },
    {
      "mcpEndpoint": "wss://api.xiaozhi.me/mcp/?token=token2",
      "tokenPath": "~/.google-mcp/tokens-user1.json"
    }
  ]
}
```

### Environment Variables (`.env`)

Only OAuth credentials are required in `.env`:

```env
# Required: OAuth credentials
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret

# Optional: OAuth redirect URI (defaults to http://localhost:3001)
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3001

# Optional: Custom accounts config path (defaults to config/accounts.json)
GOOGLE_ACCOUNTS_CONFIG=config/accounts.json

# Optional: Token refresh interval in minutes (default: 50, minimum: 15)
REFRESH_INTERVAL_MINUTES=50

# Optional: Discord webhook for notifications
DISCORD_HOOK=https://discord.com/api/webhooks/your-webhook-url

# Optional: Server port for HTTP mode (default: 3000)
PORT=3000
```

**Note**: `GOOGLE_OAUTH_TOKEN_PATH` and `MCP_ENDPOINT` are no longer used. Configure these in `config/accounts.json` instead.

## Transport Support

This MCP server supports multiple transport modes based on configuration:

### Bridge Mode (WebSocket Client)

When an account with `mcpEndpoint` is configured in `accounts.json`, the server runs in bridge mode:

```bash
# Bridge mode is automatically detected from accounts.json
pnpm run bridge
```

The bridge connects to the WebSocket endpoint and spawns the MCP server in stdio mode.

### HTTP Server Mode

When an account with `http: true` is configured (and no `mcpEndpoint`), the server runs in HTTP mode:

```bash
# HTTP server mode
pnpm run dev
# Or with custom port
PORT=3000 pnpm run dev
```

### Stdio Mode (Default for MCP Clients)

When spawned by bridge or used with MCP clients, the server automatically runs in stdio mode.

When running in HTTP mode, the server provides these endpoints:

- `GET /health` - Health check endpoint with session count
- `GET /mcp` - Session info and server status
- `POST /mcp` - Main MCP JSON-RPC endpoint for sending requests
- `DELETE /mcp` - End session endpoint

### Session Management

The Streamable HTTP transport uses the official MCP SDK with automatic session management:

1. **Automatic Sessions**: The server automatically generates secure session IDs
2. **SSE Streaming**: Supports Server-Sent Events for real-time communication
3. **JSON Responses**: Falls back to JSON responses when SSE is not available
4. **DNS Protection**: Built-in security features for production deployment

### Configuration for HTTP Transport

For HTTP transport, configure your client with the server URL:

```json
{
  "mcpServers": {
    "google-mcp-http": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Local Development

```bash
git clone https://github.com/vakharwalad23/google-mcp.git
cd google-mcp
pnpm install

# 1. Create .env file with OAuth credentials
cp template.env .env
# Edit .env and add your GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET

# 2. Create accounts.json configuration
cp config/accounts.example.json config/accounts.json
# Edit config/accounts.json with your token path and endpoint (if using bridge mode)

# 3. Run the server
# HTTP server mode (if account has http: true)
pnpm run dev

# Bridge mode (if account has mcpEndpoint)
pnpm run bridge

# The server will automatically detect the mode from accounts.json
```

Thank you for using Google MCP Tools! If you have any questions or suggestions, feel free to open an issue or contribute to the project.

## Documentation

- **[OAuth Error Handling](docs/oauth-error-handling.md)** - Detailed guide on token refresh error classification, retry logic, and Discord notifications
- **[System Architecture](docs/system-architecture.md)** - Complete system architecture, component diagrams, and data flow

Play around with the tools and enjoy!!
