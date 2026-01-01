# OAuth Token Refresh Error Handling

## Overview

The Google MCP server implements a robust token refresh mechanism with intelligent error handling, classification, and automatic retry logic for recoverable errors.

## Error Classification

All OAuth token refresh errors are automatically classified into the following categories:

| Error Type | Description | Recoverable | Color | Action Required |
|------------|-------------|-------------|-------|-----------------|
| `invalid_grant` | Token expired or revoked by user | No | Red | Re-authenticate via OAuth flow |
| `invalid_client` | Client ID or secret is incorrect | No | Orange | Check environment variables |
| `network` | Network connectivity failure | Yes | Yellow | Automatic retry with backoff |
| `rate_limit` | Too many requests to Google API | Yes | Yellow | Automatic retry with backoff |
| `unknown` | Unclassified error | No | Red | Check logs, may require re-auth |

## Error Parsing

The `parseTokenRefreshError()` function extracts error details from Google OAuth API responses:

```typescript
function parseTokenRefreshError(error: unknown): {
  errorCode: string;        // e.g., "invalid_grant", "invalid_client"
  errorDescription: string; // Human-readable description from Google
  rawMessage: string;       // Full error message
  hasResponse: boolean;     // Whether API responded (distinguishes network errors)
}
```

## Error Classification Logic

The `classifyTokenError()` function applies the following rules:

### invalid_grant
- **Trigger**: `errorCode === "invalid_grant"`
- **Sub-types**:
  - Token expired (common in Testing mode)
  - User revoked access
  - Refresh token invalid
- **Action**: Re-authentication required
- **Note**: Testing mode tokens expire after 7 days. Upgrade to Production for longer-lived tokens.

### invalid_client
- **Trigger**: `errorCode === "invalid_client"`
- **Causes**:
  - Incorrect `GOOGLE_OAUTH_CLIENT_ID`
  - Incorrect `GOOGLE_OAUTH_CLIENT_SECRET`
  - Credentials mismatch with Google Cloud Console
- **Action**: Verify OAuth credentials in `.env` file

### network
- **Trigger**: No API response OR error message contains:
  - `ECONNREFUSED`
  - `ENOTFOUND`
  - `ETIMEDOUT`
  - `fetch failed`
  - `ECONNRESET`
- **Action**: Automatic retry with exponential backoff

### rate_limit
- **Trigger**: `errorCode === "rate_limit_exceeded"` OR message contains "rate limit"
- **Action**: Automatic retry with exponential backoff

## Retry Logic

Recoverable errors (network, rate_limit) are automatically retried:

```typescript
// Retry configuration
const maxRetries = 2;
const backoffMs = Math.min(5000 * Math.pow(2, attempt), 30000);

// Retry attempts
// Attempt 1: Immediate
// Attempt 2: 5 second delay
// Attempt 3: 10 second delay
// (max 30 second backoff)
```

## Discord Notifications

All token refresh attempts and failures are reported to Discord (if `DISCORD_HOOK` is configured):

### Success Notification
```
✅ Token Refresh Successful
OAuth tokens have been refreshed successfully.

Next expiry: 2026-01-01 14:30:00
Time remaining: 60 minutes
```

### Failure Notification
```
⚠️ Token Refresh Failed: invalid_grant
Error Type: invalid_grant
Error Code: invalid_grant
Details: Token has been expired
Recoverable: No

Action Required: Re-authenticate via OAuth flow
```

## Token State Logging

Before each refresh attempt, the system logs comprehensive token state:

```typescript
{
  tokenAgeMinutes: 55,
  minutesUntilExpiry: 5,
  hasRefreshToken: true,
  systemTime: "2026-01-01T13:30:00.000Z",
  expiryTime: "2026-01-01T14:30:00.000Z"
}
```

## Integration Points

### 1. Scheduled Refresh (server-setup.ts)
```typescript
setInterval(async () => {
  try {
    const result = await refreshTokens();
    console.log(`🔁 ${result}`);
    // Discord notification sent by refreshTokens()
  } catch (e) {
    console.warn(`⚠️ Scheduled token refresh failed: ${msg}`);
    // Discord notification already sent by refreshTokens()
  }
}, intervalMs);
```

**Note**: Duplicate Discord notifications removed - now handled entirely by `refreshTokens()`.

### 2. Startup Check (server-setup.ts)
```typescript
(async () => {
  try {
    const result = await refreshTokens();
    if (result.includes("Skipping refresh")) {
      console.log(`   ℹ️  ${result}`);
    } else {
      console.log(`   🔁 Startup token refresh: ${result}`);
    }
  } catch (e) {
    console.warn(`   ⚠️  Startup token refresh check failed: ${msg}`);
  }
})();
```

### 3. Manual Refresh (utils/auth.ts)
```typescript
export async function refreshTokens(): Promise<string> {
  // Load existing tokens
  const currentTokens = loadTokensFromFile(oauthTokenPath);

  // Check if refresh needed (within 10 minutes of expiry)
  if (expiryDate > now + tenMinutesInMs) {
    return `Token is still valid. Skipping refresh.`;
  }

  // Log token state
  console.log(`🔄 Token refresh attempt:`, { ...tokenState });

  // Retry loop for recoverable errors
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { credentials } = await oAuth2Client.refreshAccessToken();
      // Save updated tokens
      // Send success Discord notification
      return successMessage;
    } catch (error) {
      const classified = classifyTokenError(...);
      if (!classified.isRecoverable || attempt >= maxRetries) {
        // Send failure Discord notification
        throw new Error(...);
      }
      // Retry with backoff
      await sleep(backoffMs);
    }
  }
}
```

## Configuration

### Environment Variables

```env
# Token refresh interval (default: 50, minimum: 15)
REFRESH_INTERVAL_MINUTES=50

# Discord webhook for notifications (optional)
DISCORD_HOOK=https://discord.com/api/webhooks/your-webhook-url
```

### Refresh Interval Recommendations

- **Default**: 50 minutes (before 1-hour token expiration)
- **Minimum**: 15 minutes (safe threshold, local expiry check prevents unnecessary API calls)
- **Maximum**: 55 minutes (warning issued if set higher due to 60-minute token lifetime)

## Common Error Scenarios

### Scenario 1: Testing Mode Token Expired
```
Error Type: invalid_grant
Details: Token has been expired
Action: Upgrade to Production and create new credentials
```

**Solution**: Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials), switch OAuth app from Testing to Production mode.

### Scenario 2: Network Interruption
```
Error Type: network
Details: Network connection failed
Recoverable: Yes
Action: Check network connectivity. Will retry automatically.
```

**Solution**: No action needed. System will retry up to 2 times with 5-10 second delays.

### Scenario 3: Invalid Client Credentials
```
Error Type: invalid_client
Details: Invalid client credentials
Action: Check GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET
```

**Solution**: Verify `.env` file contains correct OAuth credentials from Google Cloud Console.

## Debug Logging

Enable verbose logging by setting log level:

```bash
# Run with debug logging
LOG_LEVEL=debug pnpm run dev
```

Logs include:
- Token age and expiry before each refresh
- Error classification details
- Retry attempts with backoff timing
- Discord notification status

## Flow Diagram

```
┌─────────────────────────┐
│  Scheduled/Manual       │
│  Refresh Triggered      │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  Load Token File        │
│  Check Expiry (10min)   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  Log Token State        │
│  (age, expiry, etc.)    │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  Attempt Refresh        │
│  (OAuth API Call)       │
└───────────┬─────────────┘
            │
            ▼
       ┌────┴────┐
       │ Success? │
       └────┬────┘
            │
     ┌──────┴──────┐
     │             │
    Yes            No
     │             │
     ▼             ▼
┌─────────┐  ┌──────────────────┐
│ Save    │  │ Parse Error      │
│ Tokens  │  │ Classify Type    │
└────┬────┘  └────────┬─────────┘
     │                 │
     ▼                 ▼
┌─────────┐  ┌──────────────────┐
│ Discord │  │ Recoverable?     │
│ Success │  └────┬────────┬────┘
└─────────┘       │         │
               Yes         No
                  │         │
                  ▼         ▼
            ┌─────────┐  ┌─────────┐
            │ Retry   │  │ Discord │
            │ (Backoff│  │ Failure │
            │ 5-30s)  │  │ Throw   │
            └────┬────┘  └─────────┘
                 │
                 └──────►┐
                         ▼
                   ┌──────────┐
                   │ Attempt  │
                   │ Refresh  │
                   └──────────┘
```

## Best Practices

1. **Monitor Discord Notifications**: Configure `DISCORD_HOOK` for real-time alerts
2. **Use Production Mode**: Avoid 7-day token expiration in Testing mode
3. **Refresh Interval**: Set `REFRESH_INTERVAL_MINUTES` to 50 or less
4. **Check Logs**: Token state logged before each refresh for debugging
5. **Handle Errors Gracefully**: System continues running on non-critical errors

## Troubleshooting

### Continuous "invalid_grant" Errors
- Verify OAuth app is in Production mode
- Check if user revoked access in Google Account settings
- Re-authenticate using `google_oauth_reauthenticate` tool

### Network Errors During Refresh
- Check internet connectivity
- Verify firewall allows connections to `oauth2.googleapis.com`
- System will retry automatically

### Invalid Client Errors
- Double-check `GOOGLE_OAUTH_CLIENT_ID` in `.env`
- Verify `GOOGLE_OAUTH_CLIENT_SECRET` matches Google Cloud Console
- Ensure OAuth credentials type is "Desktop app"
