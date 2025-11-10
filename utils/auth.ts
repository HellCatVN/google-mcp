import { google } from "googleapis";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { fileURLToPath } from "url";
import { dirname } from "path";
import type { Credentials } from "google-auth-library";
import { startOAuthServer } from "./oauth-server.js";
import open from "open";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Get the project root directory (where index.ts is located)
// This ensures we can resolve relative paths correctly even when PM2 changes cwd
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Go up from utils/ to project root
const projectRoot = path.resolve(__dirname, "..");

/**
 * Resolves a token path to an absolute path
 * Handles:
 * - ~ (home directory expansion)
 * - Relative paths (resolved from project root)
 * - Absolute paths (returned as-is)
 * - Special case: paths starting with "/" that are meant to be relative (like "/.google-mcp/tokens.json")
 */
function resolveTokenPath(tokenPath: string): string {
  // Expand ~ to home directory
  if (tokenPath.startsWith("~/") || tokenPath === "~") {
    const homeDir = os.homedir();
    tokenPath = tokenPath.replace("~", homeDir);
  }
  
  // Special case: handle paths that start with "/" but might be meant as relative
  // e.g., "/.google-mcp/tokens.json" -> ".google-mcp/tokens.json" (relative to project root)
  // This is a common mistake in .env files
  if (tokenPath.startsWith("/.") && !tokenPath.startsWith("/home") && !tokenPath.startsWith("/root")) {
    // Remove the leading "/" to make it relative
    const relativePath = tokenPath.substring(1);
    const resolvedPath = path.resolve(projectRoot, relativePath);
    console.log(`   ⚠️  Path starts with "/" but treated as relative. Original: ${tokenPath}, Resolved: ${resolvedPath}`);
    return path.normalize(resolvedPath);
  }
  
  // If it's already absolute, normalize and return
  if (path.isAbsolute(tokenPath)) {
    // Check if the absolute path exists, if not, try treating it as relative to project root
    const normalized = path.normalize(tokenPath);
    if (!fs.existsSync(normalized)) {
      // Try as relative path from project root
      const relativeAttempt = path.resolve(projectRoot, tokenPath.substring(1)); // Remove leading /
      if (fs.existsSync(relativeAttempt)) {
        console.log(`   ℹ️  Absolute path not found, using project-relative path instead: ${relativeAttempt}`);
        return relativeAttempt;
      }
    }
    return normalized;
  }
  
  // If it's relative, resolve from project root
  // This ensures it works even when PM2 changes the working directory
  return path.resolve(projectRoot, tokenPath);
}

function saveTokensToFile(tokens: Credentials, tokenPath: string): void {
  // Resolve the path to absolute path
  const resolvedPath = resolveTokenPath(tokenPath);
  const normalizedPath = path.normalize(resolvedPath);

  // Ensure the directory exists
  const dirname = path.dirname(normalizedPath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }

  fs.writeFileSync(normalizedPath, JSON.stringify(tokens));
}

function loadTokensFromFile(tokenPath: string): Credentials {
  try {
    // Resolve the path to absolute path
    const resolvedPath = resolveTokenPath(tokenPath);
    const normalizedPath = path.normalize(resolvedPath);
    
    // Debug logging
    console.log("🔍 Token file path resolution:");
    console.log(`   Raw path from env: ${tokenPath}`);
    console.log(`   Resolved path: ${resolvedPath}`);
    console.log(`   Normalized path: ${normalizedPath}`);
    console.log(`   File exists: ${fs.existsSync(normalizedPath)}`);
    
    let fileToLoad = normalizedPath;
    
    // If the exact file doesn't exist, try some common variations
    if (!fs.existsSync(normalizedPath)) {
      const dir = path.dirname(normalizedPath);
      const basename = path.basename(normalizedPath);
      console.log(`   ⚠️  Token file not found at: ${normalizedPath}`);
      console.log(`   Directory exists: ${fs.existsSync(dir)}`);
      
      // List directory contents if it exists
      if (fs.existsSync(dir)) {
        try {
          const files = fs.readdirSync(dir);
          console.log(`   Directory contents: ${files.length > 0 ? files.join(", ") : "(empty)"}`);
          
          // Try common variations: token.json (without 's'), tokens.json (with 's')
          const alternateNames = [
            basename.replace('tokens.json', 'token.json'), // tokens.json -> token.json
            basename.replace('token.json', 'tokens.json'), // token.json -> tokens.json
          ];
          
          for (const altName of alternateNames) {
            if (altName !== basename) {
              const altPath = path.join(dir, altName);
              if (fs.existsSync(altPath)) {
                console.log(`   ✓ Found alternate token file: ${altPath}`);
                fileToLoad = altPath;
                break;
              }
            }
          }
        } catch (e) {
          console.log(`   Could not read directory: ${e}`);
        }
      } else {
        console.log(`   Directory does not exist. Will be created when tokens are saved.`);
      }
      
      if (!fs.existsSync(fileToLoad)) {
        throw new Error(`Token file not found at ${normalizedPath} (also checked common variations)`);
      }
    }
    
    return JSON.parse(fs.readFileSync(fileToLoad, "utf8"));
  } catch (err) {
    const resolvedPath = resolveTokenPath(tokenPath);
    throw new Error(
      `Error loading token file from ${resolvedPath}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

export async function createAuthClient(): Promise<any> {
  // Debug logging for environment and paths
  console.log("🔍 Authentication configuration:");
  console.log(`   Project root: ${projectRoot}`);
  console.log(`   Current working directory: ${process.cwd()}`);
  console.log(`   GOOGLE_OAUTH_CLIENT_ID: ${process.env.GOOGLE_OAUTH_CLIENT_ID ? '***' + process.env.GOOGLE_OAUTH_CLIENT_ID.slice(-10) : 'NOT SET'}`);
  console.log(`   GOOGLE_OAUTH_CLIENT_SECRET: ${process.env.GOOGLE_OAUTH_CLIENT_SECRET ? '***' + process.env.GOOGLE_OAUTH_CLIENT_SECRET.slice(-4) : 'NOT SET'}`);
  console.log(`   GOOGLE_OAUTH_TOKEN_PATH (raw): ${process.env.GOOGLE_OAUTH_TOKEN_PATH || 'NOT SET'}`);
  
  const oauthClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const oauthClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const oauthTokenPath = process.env.GOOGLE_OAUTH_TOKEN_PATH
    ? resolveTokenPath(process.env.GOOGLE_OAUTH_TOKEN_PATH)
    : undefined;
  
  console.log(`   GOOGLE_OAUTH_TOKEN_PATH (resolved): ${oauthTokenPath || 'NOT SET'}`);
  
  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost:3001";

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  // Check if OAuth credentials are placeholder values
  const isPlaceholder = oauthClientId?.includes("your-client-id") || 
                        oauthClientSecret?.includes("your-client-secret") ||
                        oauthTokenPath?.includes("your-path");
  
  if (isPlaceholder) {
    throw new Error(
      "OAuth credentials appear to be placeholder values. Please update your .env file with actual Google OAuth credentials from https://console.cloud.google.com/apis/credentials"
    );
  }

  if (oauthClientId && oauthClientSecret && oauthTokenPath) {
    const oAuth2Client = new google.auth.OAuth2(
      oauthClientId,
      oauthClientSecret,
      redirectUri
    );

    try {
      const tokens = loadTokensFromFile(oauthTokenPath);
      oAuth2Client.setCredentials(tokens);
      
      // Test the credentials by trying to refresh (if we have a refresh token)
      if (tokens.refresh_token) {
        try {
          await oAuth2Client.refreshAccessToken();
        } catch (refreshError: any) {
          if (refreshError?.response?.data?.error === "invalid_client" || 
              refreshError?.code === 401) {
            throw new Error(
              `Invalid OAuth credentials. The client ID or client secret in your .env file is incorrect.\n` +
              `Please verify your credentials at https://console.cloud.google.com/apis/credentials\n` +
              `Error: ${refreshError.message || "invalid_client"}`
            );
          }
          // If it's just a missing/invalid refresh token, we'll initiate OAuth flow
          if (refreshError?.message?.includes("invalid_grant") || 
              refreshError?.message?.includes("Token has been expired")) {
            console.warn("⚠️  Refresh token expired or invalid. Will initiate OAuth flow...");
            throw refreshError; // Re-throw to trigger OAuth flow
          }
          throw refreshError;
        }
      }
      
      return oAuth2Client;
    } catch (error: any) {
      // Check if it's an invalid_client error
      if (error?.response?.data?.error === "invalid_client" || 
          error?.code === 401 ||
          error?.message?.includes("invalid_client")) {
        throw new Error(
          `Invalid OAuth client credentials. Please check:\n` +
          `1. GOOGLE_OAUTH_CLIENT_ID is correct\n` +
          `2. GOOGLE_OAUTH_CLIENT_SECRET is correct\n` +
          `3. Credentials match your Google Cloud Console settings\n` +
          `Get your credentials at: https://console.cloud.google.com/apis/credentials\n` +
          `Original error: ${error.message || "invalid_client"}`
        );
      }
      
      // Tokens not found or invalid (but credentials are valid), initiate OAuth flow
      if (error?.message?.includes("Error loading token file") || 
          error?.message?.includes("invalid_grant") ||
          error?.message?.includes("Token has been expired")) {
        console.log("📋 No valid tokens found. Initiating OAuth flow...");
        try {
          await initiateOAuthFlow();
          // After flow completes, load the newly saved tokens
          const tokens = loadTokensFromFile(oauthTokenPath);
          oAuth2Client.setCredentials(tokens);
          return oAuth2Client;
        } catch (oauthError: any) {
          // Check if it's an invalid_client error during OAuth flow
          if (oauthError?.response?.data?.error === "invalid_client" || 
              oauthError?.code === 401 ||
              oauthError?.message?.includes("invalid_client")) {
            throw new Error(
              `Invalid OAuth client credentials. Please check:\n` +
              `1. GOOGLE_OAUTH_CLIENT_ID is correct\n` +
              `2. GOOGLE_OAUTH_CLIENT_SECRET is correct\n` +
              `3. Credentials match your Google Cloud Console settings\n` +
              `Get your credentials at: https://console.cloud.google.com/apis/credentials\n` +
              `Original error: ${oauthError.message || "invalid_client"}`
            );
          }
          throw oauthError;
        }
      }
      
      // Re-throw other errors
      throw error;
    }
  } else {
    // Fallback to service account
    if (!clientEmail || !privateKey) {
      throw new Error(
        "Authentication failed: Neither OAuth nor Service Account credentials are properly configured in environment variables."
      );
    }
    return new google.auth.JWT({
      email: clientEmail,
      key: privateKey.replace(/\\n/g, "\n"),
      scopes: [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/tasks",
      ],
      subject: process.env.GMAIL_USER_TO_IMPERSONATE,
    });
  }
}

/**
 * Kills Chrome processes that match the OAuth URL pattern
 * This is a fallback cleanup method for Linux systems where the browser process
 * might not be directly trackable from the open() call
 */
async function killChromeOAuthProcesses(authUrl: string): Promise<void> {
  try {
    // Extract a unique part of the URL to identify the process
    const urlMatch = authUrl.match(/client_id=([^&]+)/);
    if (!urlMatch) return;

    const clientId = urlMatch[1];
    const clientIdShort = clientId.substring(0, 15); // Use shorter substring for better matching
    
    // On Linux, find and kill Chrome processes with this OAuth URL
    if (os.platform() === "linux") {
      try {
        // Find Chrome processes with the OAuth URL - escape special characters
        const escapedClientId = clientIdShort.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const { stdout } = await execAsync(
          `ps aux | grep -i "chrome.*oauth2.*${escapedClientId}" | grep -v grep || true`
        );
        
        if (stdout.trim()) {
          // Extract PIDs and kill them
          const lines = stdout.trim().split("\n");
          const pids = new Set<number>();
          
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length > 1) {
              const pid = parseInt(parts[1]);
              if (!isNaN(pid)) {
                pids.add(pid);
              }
            }
          }
          
          // Kill all found processes
          for (const pid of pids) {
            try {
              // First try SIGTERM (graceful)
              process.kill(pid, "SIGTERM");
              console.log(`   🧹 Sent SIGTERM to Chrome process ${pid}`);
              
              // Wait a bit, then force kill if still running
              setTimeout(async () => {
                try {
                  // Check if process still exists
                  await execAsync(`kill -0 ${pid} 2>/dev/null || true`);
                  // If we get here, process still exists, force kill
                  process.kill(pid, "SIGKILL");
                  console.log(`   🧹 Force killed Chrome process ${pid}`);
                } catch (e) {
                  // Process already dead, good
                }
              }, 2000);
            } catch (e) {
              // Process might already be dead, ignore
            }
          }
        }
        
        // Also try to kill Chrome processes by finding the main process
        // that opened the OAuth URL (more aggressive cleanup)
        try {
          const { stdout: chromeMain } = await execAsync(
            `pgrep -f "chrome.*oauth2.*${escapedClientId}" || true`
          );
          
          if (chromeMain.trim()) {
            const mainPids = chromeMain.trim().split("\n").map(p => parseInt(p)).filter(p => !isNaN(p));
            for (const pid of mainPids) {
              try {
                // Kill the process tree
                await execAsync(`pkill -TERM -P ${pid} 2>/dev/null || true`);
                process.kill(pid, "SIGTERM");
                console.log(`   🧹 Cleaned up Chrome process tree starting from ${pid}`);
              } catch (e) {
                // Ignore
              }
            }
          }
        } catch (e) {
          // Ignore errors in secondary cleanup
        }
      } catch (e) {
        // Ignore errors in cleanup - it's best effort
      }
    }
  } catch (e) {
    // Ignore cleanup errors
  }
}

export async function initiateOAuthFlow(scopes?: string[]): Promise<void> {
  let browserProcess: any = null;
  
  try {
    // Start the OAuth server to handle the callback
    const serverPromise = startOAuthServer();

    // Generate and open the consent URL
    const authUrl = generateOAuthConsentUrl(scopes);
    
    // Open browser and track the process
    // Use wait: false to get the child process immediately
    browserProcess = await open(authUrl, { wait: false });

    // Wait for the server to complete the flow
    try {
      await serverPromise;
    } finally {
      // Always try to close the browser after OAuth completes (success or failure)
      // Wait a short moment for the redirect page to load, then close
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (browserProcess) {
        try {
          // Try to kill the process if it's still running
          if (browserProcess.pid && !browserProcess.killed) {
            browserProcess.kill("SIGTERM");
            console.log("   🧹 Closed browser process");
          }
        } catch (e) {
          // Process might already be dead, ignore
        }
      }
      
      // Fallback: kill Chrome processes by URL pattern (for Linux)
      // This is important because on Linux, open() might not return a trackable process
      await killChromeOAuthProcesses(authUrl);
    }
  } catch (error) {
    // Ensure browser is closed even on error
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (browserProcess) {
      try {
        if (browserProcess.pid && !browserProcess.killed) {
          browserProcess.kill("SIGTERM");
        }
      } catch (e) {
        // Ignore
      }
    }
    
    // Cleanup on error too
    try {
      const authUrl = generateOAuthConsentUrl(scopes);
      await killChromeOAuthProcesses(authUrl);
    } catch (e) {
      // Ignore cleanup errors
    }
    
    throw error;
  }
}

export function generateOAuthConsentUrl(scopes?: string[]): string {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost:3001";

  if (!clientId || !clientSecret) {
    throw new Error(
      "OAuth client ID and secret are required in environment variables"
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes || [
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/tasks",
    ],
    prompt: "consent",
  });
}

export async function handleOAuthCallback(code: string): Promise<void> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost:3001";
  const tokenPath = process.env.GOOGLE_OAUTH_TOKEN_PATH;

  if (!clientId || !clientSecret || !tokenPath) {
    throw new Error(
      "OAuth client ID, secret, and token path are required in environment variables"
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);
    saveTokensToFile(tokens, tokenPath);
  } catch (error: any) {
    // Check if it's an invalid_client error
    if (error?.response?.data?.error === "invalid_client" || 
        error?.code === 401 ||
        error?.message?.includes("invalid_client")) {
      throw new Error(
        `Invalid OAuth client credentials. Please check:\n` +
        `1. GOOGLE_OAUTH_CLIENT_ID is correct\n` +
        `2. GOOGLE_OAUTH_CLIENT_SECRET is correct\n` +
        `3. Credentials match your Google Cloud Console settings\n` +
        `4. Make sure you're using "Desktop app" type OAuth credentials\n` +
        `Get your credentials at: https://console.cloud.google.com/apis/credentials\n` +
        `Original error: ${error.message || "invalid_client"}`
      );
    }
    throw error;
  }
}

export async function refreshTokens(): Promise<string> {
  const oauthClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const oauthClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const oauthTokenPath = process.env.GOOGLE_OAUTH_TOKEN_PATH
    ? resolveTokenPath(process.env.GOOGLE_OAUTH_TOKEN_PATH)
    : undefined;
  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost:3001";

  if (!oauthClientId || !oauthClientSecret || !oauthTokenPath) {
    throw new Error(
      "OAuth client ID, secret, and token path are required for token refresh"
    );
  }

  try {
    // Load existing tokens
    const currentTokens = loadTokensFromFile(oauthTokenPath);

    if (!currentTokens.refresh_token) {
      throw new Error("No refresh token available. Please re-authenticate.");
    }

    // Create OAuth2 client and set credentials
    const oAuth2Client = new google.auth.OAuth2(
      oauthClientId,
      oauthClientSecret,
      redirectUri
    );

    oAuth2Client.setCredentials(currentTokens);

    // Refresh the access token
    const { credentials } = await oAuth2Client.refreshAccessToken();

    // Update tokens in file (preserve refresh_token if not returned)
    const updatedTokens = {
      ...currentTokens,
      ...credentials,
      refresh_token: credentials.refresh_token || currentTokens.refresh_token,
    };

    saveTokensToFile(updatedTokens, oauthTokenPath);

    return `Tokens refreshed successfully. New expiry: ${
      credentials.expiry_date
        ? new Date(credentials.expiry_date).toLocaleString()
        : "Unknown"
    }`;
  } catch (error) {
    throw new Error(
      `Failed to refresh tokens: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export async function reauthenticate(): Promise<string> {
  const oauthTokenPath = process.env.GOOGLE_OAUTH_TOKEN_PATH
    ? resolveTokenPath(process.env.GOOGLE_OAUTH_TOKEN_PATH)
    : undefined;

  if (!oauthTokenPath) {
    throw new Error("OAuth token path is required for re-authentication");
  }

  try {
    // Delete existing token file if it exists
    if (fs.existsSync(oauthTokenPath)) {
      fs.unlinkSync(oauthTokenPath);
    }

    // Initiate fresh OAuth flow
    await initiateOAuthFlow();

    return "Re-authentication completed successfully. New tokens have been saved.";
  } catch (error) {
    throw new Error(
      `Failed to re-authenticate: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
