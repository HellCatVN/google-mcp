/**
 * PM2 Ecosystem Configuration
 * 
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 logs google-mcp
 *   pm2 restart google-mcp
 */

module.exports = {
  apps: [
    {
      name: "google-mcp",
      script: "tsx",
      args: "index.ts",
      cwd: "/home/hellcatvn/node/google-mcp", // Update this to your actual project path
      interpreter: "node",
      env: {
        NODE_ENV: "development",
      },
      // PM2 will automatically load .env file from cwd
      // The updated code now uses absolute paths, so it should work regardless of cwd
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
    },
  ],
};

