import { type Tool } from "@modelcontextprotocol/sdk/types.js";

export const KEEP_LIST_NOTES_TOOL: Tool = {
  name: "google_keep_unofficial_list_notes",
  description:
    "List Google Keep notes/lists using the unofficial gkeepapi (read-only for lists/notes). Use forceRefresh=true to fetch fresh data from API.",
  inputSchema: {
    type: "object",
    properties: {
      filterType: {
        type: "string",
        enum: ["LIST", "NOTE"],
        description: "Optional filter by node type.",
      },
      query: {
        type: "string",
        description: "Optional text filter that matches titles or list items.",
      },
      includeItems: {
        type: "boolean",
        description: "Include list items in the output (default false).",
      },
      forceRefresh: {
        type: "boolean",
        description: "Force refresh from API instead of using cache. Use when user requests refresh/renew/làm mới.",
      },
    },
  },
};

export const KEEP_TOGGLE_ITEM_TOOL: Tool = {
  name: "google_keep_unofficial_toggle_item",
  description:
    "Check or uncheck a Google Keep list item (unofficial API).",
  inputSchema: {
    type: "object",
    properties: {
      listIdOrTitle: {
        type: "string",
        description:
          "List identifier (ID or exact title) containing the target item.",
      },
      itemTextOrId: {
        type: "string",
        description: "List item text or ID to update.",
      },
      checked: {
        type: "boolean",
        description: "true to check the item, false to uncheck.",
      },
    },
    required: ["listIdOrTitle", "itemTextOrId", "checked"],
  },
};

export const KEEP_UPDATE_LIST_TOOL: Tool = {
  name: "google_keep_unofficial_update_list",
  description:
    "Update a Google Keep list (title or color) using the unofficial API.",
  inputSchema: {
    type: "object",
    properties: {
      listIdOrTitle: {
        type: "string",
        description: "List identifier (ID or exact title) to update.",
      },
      title: {
        type: "string",
        description: "New title for the list.",
      },
      color: {
        type: "string",
        description:
          "New color (default, white, red, orange, yellow, green, teal, blue, cerulean, darkblue, purple, pink, brown, gray, grey).",
      },
    },
    required: ["listIdOrTitle"],
  },
};

export const KEEP_GET_NOTE_TOOL: Tool = {
  name: "google_keep_unofficial_get_note",
  description: "Get details for a Google Keep note (unofficial API). Use forceRefresh=true to fetch fresh data from API.",
  inputSchema: {
    type: "object",
    properties: {
      noteIdOrTitle: {
        type: "string",
        description: "Note identifier (ID or exact title).",
      },
      forceRefresh: {
        type: "boolean",
        description: "Force refresh from API instead of using cache. Use when user requests refresh/renew/làm mới.",
      },
    },
    required: ["noteIdOrTitle"],
  },
};

export const KEEP_UPDATE_NOTE_TOOL: Tool = {
  name: "google_keep_unofficial_update_note",
  description: "Update a Google Keep note (title, text, color) using the unofficial API.",
  inputSchema: {
    type: "object",
    properties: {
      noteIdOrTitle: {
        type: "string",
        description: "Note identifier (ID or exact title) to update.",
      },
      title: {
        type: "string",
        description: "New title for the note.",
      },
      text: {
        type: "string",
        description: "New body text for the note.",
      },
      color: {
        type: "string",
        description:
          "New color (default, white, red, orange, yellow, green, teal, blue, cerulean, darkblue, purple, pink, brown, gray, grey).",
      },
    },
    required: ["noteIdOrTitle"],
  },
};

export const KEEP_CREATE_NOTE_TOOL: Tool = {
  name: "google_keep_unofficial_create_note",
  description: "Create a new Google Keep note (unofficial API).",
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Title for the note.",
      },
      text: {
        type: "string",
        description: "Body text for the note.",
      },
      color: {
        type: "string",
        description:
          "Color (default, white, red, orange, yellow, green, teal, blue, cerulean, darkblue, purple, pink, brown, gray, grey).",
      },
    },
  },
};

export const KEEP_CREATE_LIST_TOOL: Tool = {
  name: "google_keep_unofficial_create_list",
  description: "Create a new Google Keep list (unofficial API).",
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Title for the list.",
      },
      items: {
        type: "array",
        description: "Initial list items.",
        items: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "Item text.",
            },
            checked: {
              type: "boolean",
              description: "Whether the item is checked.",
            },
          },
          required: ["text"],
        },
      },
      color: {
        type: "string",
        description:
          "Color (default, white, red, orange, yellow, green, teal, blue, cerulean, darkblue, purple, pink, brown, gray, grey).",
      },
    },
  },
};

export const KEEP_TRASH_TOOL: Tool = {
  name: "google_keep_unofficial_trash",
  description: "Move a Google Keep note or list to trash (unofficial API).",
  inputSchema: {
    type: "object",
    properties: {
      nodeIdOrTitle: {
        type: "string",
        description: "Note or list identifier (ID or exact title) to trash.",
      },
    },
    required: ["nodeIdOrTitle"],
  },
};

export const KEEP_RESTORE_TOOL: Tool = {
  name: "google_keep_unofficial_restore",
  description: "Restore a trashed Google Keep note or list (unofficial API).",
  inputSchema: {
    type: "object",
    properties: {
      nodeIdOrTitle: {
        type: "string",
        description: "Note or list identifier (ID or exact title) to restore.",
      },
    },
    required: ["nodeIdOrTitle"],
  },
};

export const KEEP_ARCHIVE_TOOL: Tool = {
  name: "google_keep_unofficial_archive",
  description: "Archive a Google Keep note or list (unofficial API).",
  inputSchema: {
    type: "object",
    properties: {
      nodeIdOrTitle: {
        type: "string",
        description: "Note or list identifier (ID or exact title) to archive.",
      },
    },
    required: ["nodeIdOrTitle"],
  },
};

export const KEEP_UNARCHIVE_TOOL: Tool = {
  name: "google_keep_unofficial_unarchive",
  description: "Unarchive a Google Keep note or list (unofficial API).",
  inputSchema: {
    type: "object",
    properties: {
      nodeIdOrTitle: {
        type: "string",
        description: "Note or list identifier (ID or exact title) to unarchive.",
      },
    },
    required: ["nodeIdOrTitle"],
  },
};

export const KEEP_PIN_TOOL: Tool = {
  name: "google_keep_unofficial_pin",
  description: "Pin a Google Keep note or list (unofficial API).",
  inputSchema: {
    type: "object",
    properties: {
      nodeIdOrTitle: {
        type: "string",
        description: "Note or list identifier (ID or exact title) to pin.",
      },
    },
    required: ["nodeIdOrTitle"],
  },
};

export const KEEP_UNPIN_TOOL: Tool = {
  name: "google_keep_unofficial_unpin",
  description: "Unpin a Google Keep note or list (unofficial API).",
  inputSchema: {
    type: "object",
    properties: {
      nodeIdOrTitle: {
        type: "string",
        description: "Note or list identifier (ID or exact title) to unpin.",
      },
    },
    required: ["nodeIdOrTitle"],
  },
};

export const KEEP_DELETE_TOOL: Tool = {
  name: "google_keep_unofficial_delete",
  description: "Permanently delete a Google Keep note or list (unofficial API).",
  inputSchema: {
    type: "object",
    properties: {
      nodeIdOrTitle: {
        type: "string",
        description: "Note or list identifier (ID or exact title) to delete.",
      },
    },
    required: ["nodeIdOrTitle"],
  },
};

export const KEEP_ADD_LIST_ITEM_TOOL: Tool = {
  name: "google_keep_unofficial_add_list_item",
  description: "Add an item to a Google Keep list (unofficial API).",
  inputSchema: {
    type: "object",
    properties: {
      listIdOrTitle: {
        type: "string",
        description: "List identifier (ID or exact title) to add item to.",
      },
      text: {
        type: "string",
        description: "Text for the new list item.",
      },
      checked: {
        type: "boolean",
        description: "Whether the item should be checked (default false).",
      },
    },
    required: ["listIdOrTitle", "text"],
  },
};

export const KEEP_UPDATE_LIST_ITEM_TEXT_TOOL: Tool = {
  name: "google_keep_unofficial_update_list_item_text",
  description: "Update the text of a Google Keep list item (unofficial API).",
  inputSchema: {
    type: "object",
    properties: {
      listIdOrTitle: {
        type: "string",
        description: "List identifier (ID or exact title) containing the item.",
      },
      itemTextOrId: {
        type: "string",
        description: "List item text or ID to update.",
      },
      newText: {
        type: "string",
        description: "New text for the list item.",
      },
    },
    required: ["listIdOrTitle", "itemTextOrId", "newText"],
  },
};

export const KEEP_REMOVE_LIST_ITEM_TOOL: Tool = {
  name: "google_keep_unofficial_remove_list_item",
  description: "Remove an item from a Google Keep list (unofficial API).",
  inputSchema: {
    type: "object",
    properties: {
      listIdOrTitle: {
        type: "string",
        description: "List identifier (ID or exact title) containing the item.",
      },
      itemTextOrId: {
        type: "string",
        description: "List item text or ID to remove.",
      },
    },
    required: ["listIdOrTitle", "itemTextOrId"],
  },
};

export const unofficialKeepTools = [
  KEEP_LIST_NOTES_TOOL,
  KEEP_TOGGLE_ITEM_TOOL,
  KEEP_UPDATE_LIST_TOOL,
  KEEP_GET_NOTE_TOOL,
  KEEP_UPDATE_NOTE_TOOL,
  KEEP_CREATE_NOTE_TOOL,
  KEEP_CREATE_LIST_TOOL,
  KEEP_TRASH_TOOL,
  KEEP_RESTORE_TOOL,
  KEEP_ARCHIVE_TOOL,
  KEEP_UNARCHIVE_TOOL,
  KEEP_PIN_TOOL,
  KEEP_UNPIN_TOOL,
  KEEP_DELETE_TOOL,
  KEEP_ADD_LIST_ITEM_TOOL,
  KEEP_UPDATE_LIST_ITEM_TEXT_TOOL,
  KEEP_REMOVE_LIST_ITEM_TOOL,
];
