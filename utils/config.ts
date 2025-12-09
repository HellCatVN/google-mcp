import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

export interface AccountConfig {
  mcpEndpoint?: string; // WebSocket endpoint for bridge mode
  tokenPath: string; // Path to OAuth tokens JSON
  http?: boolean; // Exactly one account should have http=true
  // Optional credentials for unofficial Google Keep (gkeepapi)
  email?: string;
  keepEmail?: string;
  masterToken?: string;
  keepMasterToken?: string;
  encryptedPassword?: string;
}

export interface AccountsFile {
  accounts: AccountConfig[];
}

function resolveProjectRoot(): string {
  // Get the directory of the current module (works in ES modules)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // utils/ -> project root
  return path.resolve(__dirname, "..");
}

export function loadAccountsConfig(): AccountsFile {
  const projectRoot = resolveProjectRoot();
  const configuredPath = process.env.GOOGLE_ACCOUNTS_CONFIG;
  const defaultPath = path.join(projectRoot, "config", "accounts.json");
  const configPath = configuredPath
    ? (path.isAbsolute(configuredPath) ? path.resolve(configuredPath) : path.join(projectRoot, configuredPath))
    : defaultPath;

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Accounts config not found at ${configPath}.\n` +
      `Please create config/accounts.json with your account configuration.\n` +
      `You can set GOOGLE_ACCOUNTS_CONFIG to use a different path.`
    );
  }

  let parsed: AccountsFile;
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    parsed = JSON.parse(raw) as AccountsFile;
  } catch (error) {
    throw new Error(
      `Failed to parse accounts config at ${configPath}: ${error instanceof Error ? error.message : String(error)}\n` +
      `Please ensure the file is valid JSON.`
    );
  }

  if (!parsed.accounts || !Array.isArray(parsed.accounts)) {
    throw new Error(
      `Invalid accounts config: 'accounts' must be an array.\n` +
      `Please check your config/accounts.json file.`
    );
  }

  if (parsed.accounts.length === 0) {
    throw new Error(
      `Invalid accounts config: 'accounts' array is empty.\n` +
      `Please add at least one account to config/accounts.json.`
    );
  }

  return parsed;
}

export function findAccountForEndpoint(accounts: AccountConfig[], endpoint: string): AccountConfig | undefined {
  // Match exact endpoint string; tokens may differ, we match full string
  return accounts.find((a) => a.mcpEndpoint === endpoint);
}

export function findHttpAccount(accounts: AccountConfig[]): AccountConfig {
  const httpAccounts = accounts.filter((a) => a.http);
  if (httpAccounts.length === 0) {
    throw new Error("No HTTP account configured (set http: true on exactly one account)");
  }
  if (httpAccounts.length > 1) {
    throw new Error("Multiple HTTP accounts configured; only one account may have http: true");
  }
  return httpAccounts[0];
}

export function ensureTokenPathEnv(tokenPath: string): void {
  process.env.GOOGLE_OAUTH_TOKEN_PATH = tokenPath;
}

export function ensureKeepCredentialsEnv(account: AccountConfig): void {
  const keepEmail = account.keepEmail || account.email;
  const keepMasterToken =
    account.keepMasterToken || account.masterToken || account.encryptedPassword;

  if (keepEmail) {
    process.env.GOOGLE_KEEP_EMAIL = keepEmail;
  }
  if (keepMasterToken) {
    process.env.GOOGLE_KEEP_MASTER_TOKEN = keepMasterToken;
  }
}


