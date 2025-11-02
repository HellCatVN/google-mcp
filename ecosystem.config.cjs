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

// Get the project root (where this config file is located)
const projectRoot = __dirname;

module.exports = {
  apps: [
    {
      name: "google-mcp",
      // Use pnpm dev which runs "tsx index.ts" - this is the cleanest approach
      // pnpm handles finding and executing tsx correctly
      script: "pnpm",
      args: ["dev"],
      
      cwd: projectRoot, // Use project root from config file location
      // PM2 will auto-detect the interpreter (pnpm is a shell script)
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

