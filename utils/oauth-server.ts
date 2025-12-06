import * as http from "http";
import * as net from "net";
import { URL } from "url";
import { handleOAuthCallback } from "./auth";

const DEFAULT_PORT = parseInt(process.env.PORT || "3001", 10);
const MAX_PORT_ATTEMPTS = 10;

/**
 * Find an available port starting from the default port
 */
function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let currentPort = startPort;
    let attempts = 0;

    const tryPort = (port: number) => {
      const server = net.createServer();
      
      server.listen(port, () => {
        server.once("close", () => {
          resolve(port);
        });
        server.close();
      });

      server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          attempts++;
          if (attempts >= MAX_PORT_ATTEMPTS) {
            reject(new Error(`Could not find an available port after ${MAX_PORT_ATTEMPTS} attempts`));
          } else {
            // Try next port
            currentPort++;
            tryPort(currentPort);
          }
        } else {
          reject(err);
        }
      });
    };

    tryPort(currentPort);
  });
}

export async function startOAuthServer(): Promise<void> {
  let serverClosed = false;
  let timeoutId: NodeJS.Timeout | null = null;
  return new Promise(async (resolve, reject) => {
    try {
      // Find an available port
      const port = await findAvailablePort(DEFAULT_PORT);
      if (port !== DEFAULT_PORT) {
        console.log(`   ⚠️  Port ${DEFAULT_PORT} is in use, using port ${port} instead`);
      }
      const redirectUri = `http://localhost:${port}`;

      process.env.GOOGLE_OAUTH_REDIRECT_URI = redirectUri;

      // Create server to handle the callback
      const server = http.createServer(async (req, res) => {
        try {
          // Parse the URL and get the code
          const url = new URL(req.url || "", redirectUri);
          const code = url.searchParams.get("code");

          if (code) {
            // Handle the OAuth callback with the received code
            await handleOAuthCallback(code);

            // Send success page to the user
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`
              <!DOCTYPE html>
              <html>
                <head>
                  <title>Authentication Successful</title>
                  <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    .success { color: #4CAF50; font-size: 24px; margin-bottom: 20px; }
                  </style>
                </head>
                <body>
                  <div class="success">Authentication Successful!</div>
                  <p>You can close this window and return to your application.</p>
                </body>
              </html>
            `);

            // Close the server and resolve the promise
            server.close(() => {
              if (timeoutId) clearTimeout(timeoutId);
              serverClosed = true;
              resolve();
            });
          } else {
            // No code found in the request
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(`
              <html><body>
                <h1>Authentication Failed</h1>
                <p>No authorization code was received.</p>
              </body></html>
            `);
            server.close(() => {
              if (timeoutId) clearTimeout(timeoutId);
              serverClosed = true;
              reject(new Error("No authorization code received"));
            });
          }
        } catch (error) {
          // Handle errors
          res.writeHead(500, { "Content-Type": "text/html" });
          res.end(`
            <html><body>
              <h1>Authentication Error</h1>
              <p>${error instanceof Error ? error.message : String(error)}</p>
            </body></html>
          `);
          server.close(() => {
            if (timeoutId) clearTimeout(timeoutId);
            serverClosed = true;
            reject(error);
          });
        }
      });

      // Start the server
      server.listen(port);

      // Handle server errors
      server.on("error", (err) => {
        if (timeoutId) clearTimeout(timeoutId);
        reject(err);
      });
      
      // Setting a timeout to close the server after 3 minutes
      timeoutId = setTimeout(() => {
        if (!serverClosed) {
          serverClosed = true;
          server.close(() => {
            reject(new Error("OAuth authentication timed out after 3 minutes"));
          });
        }
      }, 3 * 60 * 1000);
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      reject(error);
    }
  });
}
