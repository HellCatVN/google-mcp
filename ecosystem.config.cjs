/**
 * PM2 Ecosystem Configuration
 * 
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 logs google-mcp
 *   pm2 restart google-mcp
 */

const path = require("path");
const fs = require("fs");

// Get the project root (where this config file is located)
const projectRoot = __dirname;

// Try to find tsx in node_modules/.bin (works with npm/yarn/pnpm)
const tsxPath = path.join(projectRoot, "node_modules", ".bin", "tsx");

// Determine the best way to run tsx
let scriptToUse;
let argsToUse;

if (fs.existsSync(tsxPath)) {
  // Use direct path to tsx (most reliable)
  scriptToUse = tsxPath;
  argsToUse = ["index.ts"];
} else {
  // Fallback: use pnpm exec or npx
  scriptToUse = "pnpm";
  argsToUse = ["exec", "tsx", "index.ts"];
  // Alternative fallback (uncomment if pnpm doesn't work):
  // scriptToUse = "npx";
  // argsToUse = ["tsx", "index.ts"];
}

module.exports = {
  apps: [
    {
      name: "google-mcp",
      script: scriptToUse,
      args: argsToUse,
      
      cwd: projectRoot, // Use project root from config file location
      interpreter: "node",
      env: {
        NODE_ENV: "development",
      },
      // PM2 will automatically load .env file from cwd
      // The updated code now uses absolute paths, so it should work regardless of cwd
      error_file: path.join(projectRoot, "logs", "pm2-error.log"),
      out_file: path.join(projectRoot, "logs", "pm2-out.log"),
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
    },
  ],
};

