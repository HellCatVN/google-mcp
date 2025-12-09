import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import tools from "./tools/index";
import { createAuthClient } from "./utils/auth";
import GoogleCalendar from "./utils/calendar";
import GoogleGmail from "./utils/gmail";
import GoogleDrive from "./utils/drive";
import GoogleTasks from "./utils/tasks";
import { GoogleKeepUnofficial, createKeepFromEnv } from "./utils/unofficial/keep";

// Import handlers
import * as calendarHandlers from "./handlers/calendar";
import * as gmailHandlers from "./handlers/gmail";
import * as driveHandlers from "./handlers/drive";
import * as tasksHandlers from "./handlers/tasks";
import * as oauthHandlers from "./handlers/oauth";
import * as keepHandlers from "./handlers/unofficial/keep";
import { refreshTokens } from "./utils/auth";

export function createGoogleMcpServer() {
  // Service instances
  let googleCalendarInstance: GoogleCalendar;
  let googleGmailInstance: GoogleGmail;
  let googleDriveInstance: GoogleDrive;
  let googleTasksInstance: GoogleTasks;
  let googleKeepUnofficialInstance: GoogleKeepUnofficial | undefined;
  let initializationPromise: Promise<void>;
  let keepInitializationPromise: Promise<void> | undefined;

  // Service setters for OAuth handlers
  const setGoogleCalendarInstance = (instance: GoogleCalendar) => {
    googleCalendarInstance = instance;
  };
  const setGoogleGmailInstance = (instance: GoogleGmail) => {
    googleGmailInstance = instance;
  };
  const setGoogleDriveInstance = (instance: GoogleDrive) => {
    googleDriveInstance = instance;
  };
  const setGoogleTasksInstance = (instance: GoogleTasks) => {
    googleTasksInstance = instance;
  };

  // Initialize the MCP server
  const server = new Server(
    { name: "Google MCP Server", version: "0.0.1" },
    { capabilities: { tools: {} } }
  );

  // Handle the "list tools" request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.log(`📋 Tools list requested - returning ${tools.length} tools`);
    const toolsList = {
      tools,
    };
    // Log first few tool names for debugging
    if (tools.length > 0) {
      console.log(`   Sample tools: ${tools.slice(0, 5).map(t => t.name).join(", ")}...`);
    }
    return toolsList;
  });

  // Handle the "call tool" request
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const { name, arguments: args } = request.params;
      console.log(`🔧 Tool call requested: ${name}`);
      if (!args) throw new Error("No arguments provided");

      // Handle OAuth tools first (don't require initialization)
      if (name === "google_oauth_refresh_tokens") {
        return await oauthHandlers.handleOauthRefreshTokens(args, {
          setGoogleCalendarInstance,
          setGoogleGmailInstance,
          setGoogleDriveInstance,
          setGoogleTasksInstance,
        });
      }

      if (name === "google_oauth_reauthenticate") {
        return await oauthHandlers.handleOauthReauthenticate(args, {
          setGoogleCalendarInstance,
          setGoogleGmailInstance,
          setGoogleDriveInstance,
          setGoogleTasksInstance,
        });
      }

      const keepToolNames = [
        "google_keep_unofficial_list_notes",
        "google_keep_unofficial_toggle_item",
        "google_keep_unofficial_update_list",
        "google_keep_unofficial_get_note",
        "google_keep_unofficial_update_note",
        "google_keep_unofficial_create_note",
        "google_keep_unofficial_create_list",
        "google_keep_unofficial_trash",
        "google_keep_unofficial_restore",
        "google_keep_unofficial_archive",
        "google_keep_unofficial_unarchive",
        "google_keep_unofficial_pin",
        "google_keep_unofficial_unpin",
        "google_keep_unofficial_delete",
        "google_keep_unofficial_add_list_item",
        "google_keep_unofficial_update_list_item_text",
        "google_keep_unofficial_remove_list_item",
      ];

      if (keepToolNames.includes(name)) {
        console.log(`📝 [Keep] Keep tool detected: ${name}`);
        console.log(`📝 [Keep] Arguments:`, JSON.stringify(args, null, 2));
        
        if (!keepInitializationPromise) {
          console.log(`🔐 [Keep] Initializing Google Keep (unofficial)...`);
          keepInitializationPromise = Promise.resolve()
            .then(() => {
              googleKeepUnofficialInstance = createKeepFromEnv();
              console.log("✅ Google Keep (unofficial) initialized");
            })
            .catch((error) => {
              console.error(`❌ [Keep] Initialization failed:`, error);
              keepInitializationPromise = undefined;
              throw error;
            });
        }

        console.log(`⏳ [Keep] Waiting for initialization...`);
        await keepInitializationPromise;

        if (!googleKeepUnofficialInstance) {
          console.error(`❌ [Keep] Instance is null after initialization!`);
          throw new Error("Google Keep (unofficial) failed to initialize.");
        }
        
        console.log(`✅ [Keep] Instance ready, routing to handler...`);

        try {
          let result;
          switch (name) {
            case "google_keep_unofficial_list_notes":
              result = await keepHandlers.handleKeepListNotes(
                args,
                googleKeepUnofficialInstance
              );
              break;
            case "google_keep_unofficial_toggle_item":
              result = await keepHandlers.handleKeepToggleItem(
                args,
                googleKeepUnofficialInstance
              );
              break;
            case "google_keep_unofficial_update_list":
              result = await keepHandlers.handleKeepUpdateList(
                args,
                googleKeepUnofficialInstance
              );
              break;
            case "google_keep_unofficial_get_note":
              result = await keepHandlers.handleKeepGetNote(
                args,
                googleKeepUnofficialInstance
              );
              break;
            case "google_keep_unofficial_update_note":
              result = await keepHandlers.handleKeepUpdateNote(
                args,
                googleKeepUnofficialInstance
              );
              break;
            case "google_keep_unofficial_create_note":
              result = await keepHandlers.handleKeepCreateNote(
                args,
                googleKeepUnofficialInstance
              );
              break;
            case "google_keep_unofficial_create_list":
              result = await keepHandlers.handleKeepCreateList(
                args,
                googleKeepUnofficialInstance
              );
              break;
            case "google_keep_unofficial_trash":
              result = await keepHandlers.handleKeepTrash(
                args,
                googleKeepUnofficialInstance
              );
              break;
            case "google_keep_unofficial_restore":
              result = await keepHandlers.handleKeepRestore(
                args,
                googleKeepUnofficialInstance
              );
              break;
            case "google_keep_unofficial_archive":
              result = await keepHandlers.handleKeepArchive(
                args,
                googleKeepUnofficialInstance
              );
              break;
            case "google_keep_unofficial_unarchive":
              result = await keepHandlers.handleKeepUnarchive(
                args,
                googleKeepUnofficialInstance
              );
              break;
            case "google_keep_unofficial_pin":
              result = await keepHandlers.handleKeepPin(
                args,
                googleKeepUnofficialInstance
              );
              break;
            case "google_keep_unofficial_unpin":
              result = await keepHandlers.handleKeepUnpin(
                args,
                googleKeepUnofficialInstance
              );
              break;
            case "google_keep_unofficial_delete":
              result = await keepHandlers.handleKeepDelete(
                args,
                googleKeepUnofficialInstance
              );
              break;
            case "google_keep_unofficial_add_list_item":
              result = await keepHandlers.handleKeepAddListItem(
                args,
                googleKeepUnofficialInstance
              );
              break;
            case "google_keep_unofficial_update_list_item_text":
              result = await keepHandlers.handleKeepUpdateListItemText(
                args,
                googleKeepUnofficialInstance
              );
              break;
            case "google_keep_unofficial_remove_list_item":
              result = await keepHandlers.handleKeepRemoveListItem(
                args,
                googleKeepUnofficialInstance
              );
              break;
            default:
              console.error(`❌ [Keep] Unknown Keep tool: ${name}`);
              throw new Error(`Unknown Keep tool: ${name}`);
          }
          console.log(`✅ [Keep] Tool ${name} completed successfully`);
          return result;
        } catch (error) {
          console.error(`❌ [Keep] Error in tool ${name}:`, error);
          console.error(`   Error type: ${error instanceof Error ? error.constructor.name : typeof error}`);
          console.error(`   Error message: ${error instanceof Error ? error.message : String(error)}`);
          if (error instanceof Error && error.stack) {
            console.error(`   Error stack: ${error.stack}`);
          }
          throw error;
        }
      }

      // For all other tools, ensure initialization is complete
      await initializationPromise;
      if (
        !googleCalendarInstance ||
        !googleGmailInstance ||
        !googleDriveInstance ||
        !googleTasksInstance
      ) {
        throw new Error("Authentication failed to initialize services");
      }

      // Route to appropriate handlers
      switch (name) {
        // Calendar tools
        case "google_calendar_set_default":
          return await calendarHandlers.handleCalendarSetDefault(
            args,
            googleCalendarInstance
          );
        case "google_calendar_list_calendars":
          return await calendarHandlers.handleCalendarListCalendars(
            args,
            googleCalendarInstance
          );
        case "google_calendar_create_event":
          return await calendarHandlers.handleCalendarCreateEvent(
            args,
            googleCalendarInstance
          );
        case "google_calendar_get_events":
          return await calendarHandlers.handleCalendarGetEvents(
            args,
            googleCalendarInstance
          );
        case "google_calendar_get_event":
          return await calendarHandlers.handleCalendarGetEvent(
            args,
            googleCalendarInstance
          );
        case "google_calendar_update_event":
          return await calendarHandlers.handleCalendarUpdateEvent(
            args,
            googleCalendarInstance
          );
        case "google_calendar_delete_event":
          return await calendarHandlers.handleCalendarDeleteEvent(
            args,
            googleCalendarInstance
          );
        case "google_calendar_find_free_time":
          return await calendarHandlers.handleCalendarFindFreeTime(
            args,
            googleCalendarInstance
          );

        // Gmail tools
        case "google_gmail_list_labels":
          return await gmailHandlers.handleGmailListLabels(
            args,
            googleGmailInstance
          );
        case "google_gmail_list_emails":
          return await gmailHandlers.handleGmailListEmails(
            args,
            googleGmailInstance
          );
        case "google_gmail_get_email":
          return await gmailHandlers.handleGmailGetEmail(
            args,
            googleGmailInstance
          );
        case "google_gmail_get_email_by_index":
          return await gmailHandlers.handleGmailGetEmailByIndex(
            args,
            googleGmailInstance
          );
        case "google_gmail_send_email":
          return await gmailHandlers.handleGmailSendEmail(
            args,
            googleGmailInstance
          );
        case "google_gmail_draft_email":
          return await gmailHandlers.handleGmailDraftEmail(
            args,
            googleGmailInstance
          );
        case "google_gmail_delete_email":
          return await gmailHandlers.handleGmailDeleteEmail(
            args,
            googleGmailInstance
          );
        case "google_gmail_modify_labels":
          return await gmailHandlers.handleGmailModifyLabels(
            args,
            googleGmailInstance
          );
        case "google_gmail_download_attachments":
          return await gmailHandlers.handleGmailDownloadAttachments(
            args,
            googleGmailInstance
          );

        // Drive tools
        case "google_drive_list_files":
          return await driveHandlers.handleDriveListFiles(
            args,
            googleDriveInstance
          );
        case "google_drive_get_file_content":
          return await driveHandlers.handleDriveGetFileContent(
            args,
            googleDriveInstance
          );
        case "google_drive_create_file":
          return await driveHandlers.handleDriveCreateFile(
            args,
            googleDriveInstance
          );
        case "google_drive_update_file":
          return await driveHandlers.handleDriveUpdateFile(
            args,
            googleDriveInstance
          );
        case "google_drive_delete_file":
          return await driveHandlers.handleDriveDeleteFile(
            args,
            googleDriveInstance
          );
        case "google_drive_share_file":
          return await driveHandlers.handleDriveShareFile(
            args,
            googleDriveInstance
          );

        // Tasks tools
        case "google_tasks_set_default_list":
          return await tasksHandlers.handleTasksSetDefaultList(
            args,
            googleTasksInstance
          );
        case "google_tasks_list_tasklists":
          return await tasksHandlers.handleTasksListTasklists(
            args,
            googleTasksInstance
          );
        case "google_tasks_list_tasks":
          return await tasksHandlers.handleTasksListTasks(
            args,
            googleTasksInstance
          );
        case "google_tasks_get_task":
          return await tasksHandlers.handleTasksGetTask(
            args,
            googleTasksInstance
          );
        case "google_tasks_create_task":
          return await tasksHandlers.handleTasksCreateTask(
            args,
            googleTasksInstance
          );
        case "google_tasks_update_task":
          return await tasksHandlers.handleTasksUpdateTask(
            args,
            googleTasksInstance
          );
        case "google_tasks_complete_task":
          return await tasksHandlers.handleTasksCompleteTask(
            args,
            googleTasksInstance
          );
        case "google_tasks_delete_task":
          return await tasksHandlers.handleTasksDeleteTask(
            args,
            googleTasksInstance
          );
        case "google_tasks_create_tasklist":
          return await tasksHandlers.handleTasksCreateTasklist(
            args,
            googleTasksInstance
          );
        case "google_tasks_delete_tasklist":
          return await tasksHandlers.handleTasksDeleteTasklist(
            args,
            googleTasksInstance
          );

        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
        isError: true,
      };
    }
  });

  // Initialize authentication and services immediately
  // This will trigger OAuth flow if tokens don't exist
  console.log("🔐 Initializing authentication...");
  initializationPromise = createAuthClient()
    .then((authClient) => {
      googleCalendarInstance = new GoogleCalendar(authClient);
      googleGmailInstance = new GoogleGmail(authClient);
      googleDriveInstance = new GoogleDrive(authClient);
      googleTasksInstance = new GoogleTasks(authClient);
      console.log("✅ Google services initialized successfully");

      // Check token expiry on startup and refresh if expiring within 10 minutes
      // This ensures tokens are refreshed even after server restarts/crashes
      // The refreshTokens() function already checks for 10-minute expiry threshold
      (async () => {
        try {
          const result = await refreshTokens();
          if (result.includes("Skipping refresh")) {
            // Token is still valid, no action needed
            console.log(`   ℹ️  ${result}`);
          } else {
            // Token was refreshed
            console.log(`   🔁 Startup token refresh: ${result}`);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error";
          console.warn(`   ⚠️  Startup token refresh check failed: ${msg}`);
          // Don't throw - allow server to continue, scheduler will handle future refreshes
        }
      })();

      // Helper function for Discord notifications
      const sendDiscord = async (message: string, title?: string) => {
        const webhook = process.env.DISCORD_HOOK;
        if (!webhook) return;
        try {
          await fetch(webhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              embeds: [
                {
                  title: title || "🔁 Token Refresh",
                  description: message,
                  color: 0x57ab5a,
                  timestamp: new Date().toISOString(),
                  footer: { text: "Google MCP Server" },
                },
              ],
            }),
          });
        } catch {
          // best-effort only
        }
      };

      // Start proactive token refresh scheduler
      // Google OAuth access tokens expire after ~1 hour, so we need to refresh more frequently
      // Default: refresh every 50 minutes (before 1-hour expiration)
      // Minimum: 5 minutes (safe because refreshTokens() checks expiry_date locally before API calls)
      const configuredMinutes = parseInt(process.env.REFRESH_INTERVAL_MINUTES || "", 10);
      const defaultMinutes = 50; // Refresh every 50 minutes (before 1-hour token expiration)
      const minutes = configuredMinutes || defaultMinutes;
      const intervalMs = Math.max(5, minutes) * 60 * 1000; // minimum 5 minutes
      console.log(
        `🔁 Proactive token refresh scheduler started (every ${Math.round(
          intervalMs / 60000
        )} minutes)`
      );
      if (minutes > 55) {
        console.warn(
          `   ⚠️  Warning: Refresh interval (${minutes} min) is longer than token expiration (~60 min).`
        );
        console.warn(
          `   Consider setting REFRESH_INTERVAL_MINUTES to 50 or less to prevent token expiration.`
        );
      }

      setInterval(async () => {
        try {
          const result = await refreshTokens();
          console.log(`🔁 ${result}`);
          // Optionally notify success once per day could be added; for now, no Discord on success
        } catch (e) {
          const msg =
            e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error";
          console.warn(`⚠️  Scheduled token refresh failed: ${msg}`);
          // Notify via Discord if configured
          await sendDiscord(
            `Scheduled token refresh failed.\n\nError: ${msg}\n\n` +
              "If this persists, re-authentication may be required.",
            "⚠️ Scheduled Token Refresh Failed"
          );
        }
      }, intervalMs);
    })
    .catch((error) => {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("\n❌ Authentication initialization failed:");
      console.error(`   ${errorMsg}`);
      
      // Check if it's a token file missing error (should trigger OAuth flow)
      if (errorMsg.includes("Error loading token file") || 
          errorMsg.includes("Token file not found") ||
          errorMsg.includes("ENOENT")) {
        console.error("\n💡 OAuth authentication flow should be triggered automatically.");
        console.error("   If you don't see a browser window, the OAuth flow may have failed.");
        console.error("   You can manually trigger re-authentication using the google_oauth_reauthenticate tool.\n");
      } else if (errorMsg.includes("placeholder") || errorMsg.includes("invalid_client")) {
        console.error("\n💡 To fix this:");
        console.error("   1. Go to https://console.cloud.google.com/apis/credentials");
        console.error("   2. Create OAuth 2.0 credentials (Desktop app type)");
        console.error("   3. Update your .env file with:");
        console.error("      GOOGLE_OAUTH_CLIENT_ID=<your-actual-client-id>");
        console.error("      GOOGLE_OAUTH_CLIENT_SECRET=<your-actual-client-secret>");
        console.error("\n⚠️  The server will continue running, but tools will fail until authentication is configured.\n");
      } else {
        console.error("\n💡 This error will be shown again when a tool is called.");
        console.error("   If OAuth flow is needed, it will be triggered automatically.\n");
      }
      // Re-throw so it can be caught when tools are called
      throw error;
    });

  return server;
}
