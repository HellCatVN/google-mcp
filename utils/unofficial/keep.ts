import Keep from "../../lib/gkeepapi/src/index.js";
import logger from "../logger";

export interface KeepListOptions {
  filterType?: "LIST" | "NOTE";
  query?: string;
  includeItems?: boolean;
  forceRefresh?: boolean;
}

export interface KeepListUpdateOptions {
  title?: string;
  color?: string;
}

export interface KeepNoteUpdateOptions {
  title?: string;
  text?: string;
  color?: string;
}

interface KeepCredentials {
  email: string;
  masterToken: string;
}

type KeepColor =
  | "DEFAULT"
  | "RED"
  | "ORANGE"
  | "YELLOW"
  | "GREEN"
  | "TEAL"
  | "BLUE"
  | "CERULEAN"
  | "PURPLE"
  | "PINK"
  | "BROWN"
  | "GRAY";

const COLOR_MAP: Record<string, KeepColor> = {
  default: "DEFAULT",
  white: "DEFAULT",
  red: "RED",
  orange: "ORANGE",
  yellow: "YELLOW",
  green: "GREEN",
  teal: "TEAL",
  blue: "BLUE",
  cerulean: "CERULEAN",
  darkblue: "CERULEAN",
  purple: "PURPLE",
  pink: "PINK",
  brown: "BROWN",
  gray: "GRAY",
  grey: "GRAY",
};

function normalize(value?: string) {
  return value ? value.trim().toLowerCase() : "";
}

function isTrashed(timestamps: any): boolean {
  if (!timestamps?.trashed) {
    return false;
  }
  // Check if trashed timestamp is a valid date (not epoch date "1970-01-01T00:00:00.000Z")
  const trashedDate = new Date(timestamps.trashed);
  const epochDate = new Date("1970-01-01T00:00:00.000Z");
  // If trashed date is after epoch, it's actually trashed
  return trashedDate.getTime() > epochDate.getTime();
}

export class GoogleKeepUnofficial {
  private keep: Keep;

  constructor(credentials: KeepCredentials) {
    if (!credentials.email || !credentials.masterToken) {
      throw new Error(
        "Google Keep credentials are missing. Please provide both email and master token."
      );
    }
    this.keep = new Keep(credentials.email, credentials.masterToken);
  }

  private findList(lists: any[], identifier: string) {
    const normalized = normalize(identifier);
    logger.debug(`🔎 [Keep] findList: searching for "${identifier}" (normalized: "${normalized}")`);
    const byId = lists.find((list) => normalize(list.id) === normalized);
    if (byId) {
      logger.debug(`✅ [Keep] findList: found by ID: "${byId.id}"`);
      return byId;
    }
    const byTitle = lists.find((list) => normalize(list.title) === normalized);
    if (byTitle) {
      logger.debug(`✅ [Keep] findList: found by title: "${byTitle.title}" (id: "${byTitle.id}")`);
      return byTitle;
    }
    logger.debug(`❌ [Keep] findList: not found`);
    return undefined;
  }

  private findNote(notes: any[], identifier: string) {
    const normalized = normalize(identifier);
    logger.debug(`🔎 [Keep] findNote: searching for "${identifier}" (normalized: "${normalized}")`);
    const byId = notes.find((note) => normalize(note.id) === normalized);
    if (byId) {
      logger.debug(`✅ [Keep] findNote: found by ID: "${byId.id}"`);
      return byId;
    }
    const byTitle = notes.find((note) => normalize(note.title) === normalized);
    if (byTitle) {
      logger.debug(`✅ [Keep] findNote: found by title: "${byTitle.title}" (id: "${byTitle.id}")`);
      return byTitle;
    }
    logger.debug(`❌ [Keep] findNote: not found`);
    return undefined;
  }

  private findItem(items: any[], identifier: string) {
    const normalized = normalize(identifier);
    logger.debug(`🔎 [Keep] findItem: searching for "${identifier}" (normalized: "${normalized}")`);
    const byId = items.find((item) => normalize(item.id) === normalized);
    if (byId) {
      logger.debug(`✅ [Keep] findItem: found by ID: "${byId.id}"`);
      return byId;
    }
    const byText = items.find((item) => normalize(item.text) === normalized);
    if (byText) {
      logger.debug(`✅ [Keep] findItem: found by text: "${byText.text}" (id: "${byText.id}")`);
      return byText;
    }
    logger.debug(`❌ [Keep] findItem: not found`);
    return undefined;
  }

  private formatList(list: any, includeItems?: boolean) {
    const updated =
      list.lastModifiedAt instanceof Date
        ? list.lastModifiedAt.toISOString()
        : "unknown";
    const trashed = isTrashed(list.timestamps) ? " trashed" : "";
    const header = `[${list.type}] ${list.title || "(untitled)"} (id: ${
      list.id
    })${list.color ? ` color=${list.color}` : ""}${trashed}\nUpdated: ${updated}`;

    if (!includeItems || list.type !== "LIST") {
      return header;
    }

    if (!list.items || list.items.length === 0) {
      return `${header}\nItems: (empty)`;
    }

    const items = list.items
      .map(
        (item: any) =>
          `- [${item.checked ? "x" : " "}] ${item.text || "(no text)"} (id: ${
            item.id
          })`
      )
      .join("\n");

    return `${header}\nItems:\n${items}`;
  }

  private formatNote(note: any) {
    const updated =
      note.timestamps?.updated || note.timestamps?.userEdited
        ? new Date(note.timestamps.updated || note.timestamps.userEdited).toISOString()
        : "unknown";
    const body = note.text ? `\nBody:\n${note.text}` : "";
    const color = note.color ? ` color=${note.color}` : "";
    const pinned = note.isPinned ? " pinned" : "";
    const archived = note.isArchived ? " archived" : "";
    const trashed = isTrashed(note.timestamps) ? " trashed" : "";
    return `[NOTE] ${note.title || "(untitled)"} (id: ${note.id})${color}${pinned}${archived}${trashed}\nUpdated: ${updated}${body}`;
  }

  async listNotes(options: KeepListOptions = {}) {
    const { filterType, query, includeItems, forceRefresh = false } = options;
    const normalizedQuery = normalize(query);

      if (forceRefresh) {
        logger.debug(`🔄 [Keep] Force refresh requested - fetching fresh data from API...`);
      } else {
        logger.debug(`📥 [Keep] Fetching all notes/lists (using cache)...`);
      }
    const allNotes = await this.keep.all(forceRefresh);
    
    const filtered = allNotes.filter((note: any) => {
      // Exclude trashed items from listing (unless explicitly requested)
      if (isTrashed(note.timestamps)) {
        return false;
      }
      
      const matchesType = filterType ? note.type === filterType : true;
      if (!normalizedQuery) return matchesType;

      const titleMatch = normalize(note.title).includes(normalizedQuery);
      const itemMatch =
        includeItems && note.items
          ? note.items.some((item: any) =>
              normalize(item.text).includes(normalizedQuery)
            )
          : false;

      return matchesType && (titleMatch || itemMatch);
    });

    if (filtered.length === 0) {
      return "No matching Google Keep notes found.";
    }

    return filtered
      .map((note: any) => this.formatList(note, includeItems))
      .join("\n\n");
  }

  async toggleListItem(
    listIdOrTitle: string,
    itemTextOrId: string,
    checked: boolean
  ) {
    // Use fresh data for write operations to ensure we have the latest items
    const lists = await this.keep.allLists(true);
    const targetList = this.findList(lists, listIdOrTitle);

    if (!targetList) {
      throw new Error(`List not found for identifier: ${listIdOrTitle}`);
    }

    const targetItem = this.findItem(targetList.items || [], itemTextOrId);

    if (!targetItem) {
      throw new Error(
        `List item not found in "${targetList.title || targetList.id}" for identifier: ${itemTextOrId}`
      );
    }

    targetItem.checked = checked;
    await targetItem.save();
    
    // Refresh cache after write operation to ensure next operation has fresh data
    await this.keep.sync(true);

    return `Item "${targetItem.text || targetItem.id}" is now ${
      checked ? "checked" : "unchecked"
    } in list "${targetList.title || targetList.id}".`;
  }

  async updateList(listIdOrTitle: string, updates: KeepListUpdateOptions) {
    if (!updates.title && !updates.color) {
      throw new Error("Provide at least one of: title or color.");
    }

    const lists = await this.keep.allLists();
    const targetList = this.findList(lists, listIdOrTitle);

    if (!targetList) {
      throw new Error(`List not found for identifier: ${listIdOrTitle}`);
    }

    if (updates.title) {
      targetList.title = updates.title;
    }

    if (updates.color) {
      const normalizedColor = normalize(updates.color);
      const mapped = COLOR_MAP[normalizedColor];
      if (!mapped) {
        const supported = Object.keys(COLOR_MAP).join(", ");
        throw new Error(
          `Unsupported color "${updates.color}". Supported values: ${supported}`
        );
      }
      targetList.color = mapped;
    }

    await targetList.save();
    
    // Refresh cache after write operation to ensure state is updated
    await this.keep.sync(true);

    return `List "${targetList.title || targetList.id}" updated successfully.`;
  }

  async getNoteDetails(noteIdOrTitle: string, forceRefresh = false) {
    logger.debug(`🔍 [Keep] getNoteDetails called with identifier: "${noteIdOrTitle}"`);
    
    try {
      if (forceRefresh) {
        logger.debug(`🔄 [Keep] Force refresh requested - fetching fresh data from API...`);
      } else {
        logger.debug(`📥 [Keep] Fetching all notes (using cache)...`);
      }
      const allNotes = await this.keep.allNotes(forceRefresh);
      logger.debug(`📊 [Keep] Found ${allNotes.length} total notes (including trashed)`);
      
      // Search in all notes including trashed ones
      let target = this.findNote(allNotes, noteIdOrTitle);
      
      // If not found in notes, also check lists (since "Danh sách" means "list" in Vietnamese)
      if (!target) {
        logger.debug(`🔍 [Keep] Not found in notes, checking lists...`);
        const allLists = await this.keep.allLists(forceRefresh);
        logger.debug(`📊 [Keep] Found ${allLists.length} total lists (including trashed)`);
        const listTarget = this.findList(allLists, noteIdOrTitle);
        if (listTarget) {
          logger.debug(`✅ [Keep] Found as LIST: id="${listTarget.id}", title="${listTarget.title || '(untitled)'}"`);
          const isListTrashed = isTrashed(listTarget.timestamps);
          if (isListTrashed) {
            logger.debug(`⚠️ [Keep] Note: This list is in trash`);
          }
          return this.formatList(listTarget, true);
        }
      }
      
      // Log if the found note is trashed
      if (target) {
        const isNoteTrashed = isTrashed(target.timestamps);
        if (isNoteTrashed) {
          logger.debug(`⚠️ [Keep] Note: This note is in trash`);
        }
      }
      
      if (allNotes.length > 0) {
        logger.debug(`📋 [Keep] Sample note IDs: ${allNotes.slice(0, 5).map((n: any) => n.id).join(", ")}`);
        logger.debug(`📋 [Keep] Sample note titles: ${allNotes.slice(0, 5).map((n: any) => `"${n.title || '(untitled)'}"`).join(", ")}`);
      }
      
      if (!target) {
        logger.error(`❌ [Keep] Note/List not found!`);
        logger.error(`   Searched identifier: "${noteIdOrTitle}"`);
        logger.error(`   Available note IDs (first 10): ${allNotes.slice(0, 10).map((n: any) => n.id).join(", ")}`);
        logger.error(`   Available note titles (first 10): ${allNotes.slice(0, 10).map((n: any) => `"${n.title || '(untitled)'}"`).join(", ")}`);
        
        // Also show lists
        const allLists = await this.keep.allLists(forceRefresh);
        if (allLists.length > 0) {
          logger.error(`   Available list IDs (first 10): ${allLists.slice(0, 10).map((l: any) => l.id).join(", ")}`);
          logger.error(`   Available list titles (first 10): ${allLists.slice(0, 10).map((l: any) => `"${l.title || '(untitled)'}"`).join(", ")}`);
        }
        
        throw new Error(`Note or list not found for identifier: ${noteIdOrTitle}`);
      }
      
      logger.debug(`✅ [Keep] Found note: id="${target.id}", title="${target.title || '(untitled)'}"`);
      const formatted = this.formatNote(target);
      logger.debug(`📄 [Keep] Formatted note length: ${formatted.length} characters`);
      return formatted;
    } catch (error) {
      logger.error(`❌ [Keep] Error in getNoteDetails:`, error);
      logger.error(`   Error type: ${error instanceof Error ? error.constructor.name : typeof error}`);
      logger.error(`   Error message: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof Error && error.stack) {
        logger.error(`   Error stack: ${error.stack}`);
      }
      throw error;
    }
  }

  async updateNote(noteIdOrTitle: string, updates: KeepNoteUpdateOptions) {
    if (!updates.title && !updates.text && !updates.color) {
      throw new Error("Provide at least one of: title, text, color.");
    }
    const notes = await this.keep.allNotes();
    const target = this.findNote(notes, noteIdOrTitle);
    if (!target) {
      throw new Error(`Note not found for identifier: ${noteIdOrTitle}`);
    }

    if (updates.title) target.title = updates.title;
    if (updates.text !== undefined) target.text = updates.text;
    if (updates.color) {
      const mapped = COLOR_MAP[normalize(updates.color)];
      if (!mapped) {
        const supported = Object.keys(COLOR_MAP).join(", ");
        throw new Error(
          `Unsupported color "${updates.color}". Supported values: ${supported}`
        );
      }
      target.color = mapped;
    }

    await target.save();
    
    // Refresh cache after write operation to ensure state is updated
    await this.keep.sync(true);
    
    return `Note "${target.title || target.id}" updated successfully.`;
  }

  async createNote(title = "", text = "", color?: string) {
    const mappedColor = color ? COLOR_MAP[normalize(color)] : undefined;
    if (color && !mappedColor) {
      const supported = Object.keys(COLOR_MAP).join(", ");
      throw new Error(
        `Unsupported color "${color}". Supported values: ${supported}`
      );
    }
    const note = this.keep.createNote(title, text, mappedColor);
    await note.save();
    
    // Refresh cache after write operation to ensure new note is available
    await this.keep.sync(true);
    
    return `Note "${note.title || note.id}" created successfully.`;
  }

  async createList(
    title = "",
    items: Array<{ text: string; checked?: boolean }> = [],
    color?: string
  ) {
    const mappedColor = color ? COLOR_MAP[normalize(color)] : undefined;
    if (color && !mappedColor) {
      const supported = Object.keys(COLOR_MAP).join(", ");
      throw new Error(
        `Unsupported color "${color}". Supported values: ${supported}`
      );
    }
    const list = this.keep.createList(title, items, mappedColor);
    await list.save();
    
    // Refresh cache after write operation to ensure new list is available
    await this.keep.sync(true);
    
    return `List "${list.title || list.id}" created successfully with ${items.length} item(s).`;
  }

  private async findNodeByIdOrTitle(nodeIdOrTitle: string) {
    const allNodes = await this.keep.all();
    const normalized = normalize(nodeIdOrTitle);
    const byId = allNodes.find((node) => normalize(node.id) === normalized);
    if (byId) return byId;
    return allNodes.find((node) => normalize(node.title) === normalized);
  }

  async trash(nodeIdOrTitle: string) {
    const node = await this.findNodeByIdOrTitle(nodeIdOrTitle);
    if (!node) {
      throw new Error(`Node not found for identifier: ${nodeIdOrTitle}`);
    }
    await this.keep.trash(node.id);
    // Refresh cache after write operation to ensure state is updated
    await this.keep.sync(true);
    return `"${node.title || node.id}" moved to trash successfully.`;
  }

  async restore(nodeIdOrTitle: string) {
    const node = await this.findNodeByIdOrTitle(nodeIdOrTitle);
    if (!node) {
      throw new Error(`Node not found for identifier: ${nodeIdOrTitle}`);
    }
    
    const wasTrashed = isTrashed(node.timestamps);
    logger.debug(`🔄 [Keep] Restoring node: id="${node.id}", title="${node.title || '(untitled)'}"`);
    logger.debug(`   Was trashed: ${wasTrashed}`);
    if (wasTrashed) {
      logger.debug(`   Trashed timestamp before restore: ${node.timestamps?.trashed}`);
    }
    
    await this.keep.restore(node.id);
    
    // Refresh cache after write operation to ensure state is updated
    logger.debug(`🔄 [Keep] Refreshing cache after restore...`);
    await this.keep.sync(true);
    
    // Verify the restore worked
    const updatedNode = await this.findNodeByIdOrTitle(nodeIdOrTitle);
    if (updatedNode) {
      const isStillTrashed = isTrashed(updatedNode.timestamps);
      logger.debug(`   Trashed timestamp after restore: ${updatedNode.timestamps?.trashed}`);
      logger.debug(`   Is still trashed: ${isStillTrashed}`);
      if (isStillTrashed) {
        logger.warn(`⚠️ [Keep] Warning: Node still appears to be trashed after restore operation`);
      }
    }
    
    return `"${node.title || node.id}" restored successfully.`;
  }

  async archive(nodeIdOrTitle: string) {
    const node = await this.findNodeByIdOrTitle(nodeIdOrTitle);
    if (!node) {
      throw new Error(`Node not found for identifier: ${nodeIdOrTitle}`);
    }
    await this.keep.archive(node.id);
    // Refresh cache after write operation to ensure state is updated
    await this.keep.sync(true);
    return `"${node.title || node.id}" archived successfully.`;
  }

  async unarchive(nodeIdOrTitle: string) {
    const node = await this.findNodeByIdOrTitle(nodeIdOrTitle);
    if (!node) {
      throw new Error(`Node not found for identifier: ${nodeIdOrTitle}`);
    }
    await this.keep.unarchive(node.id);
    // Refresh cache after write operation to ensure state is updated
    await this.keep.sync(true);
    return `"${node.title || node.id}" unarchived successfully.`;
  }

  async pin(nodeIdOrTitle: string) {
    const node = await this.findNodeByIdOrTitle(nodeIdOrTitle);
    if (!node) {
      throw new Error(`Node not found for identifier: ${nodeIdOrTitle}`);
    }
    await this.keep.pin(node.id);
    // Refresh cache after write operation to ensure state is updated
    await this.keep.sync(true);
    return `"${node.title || node.id}" pinned successfully.`;
  }

  async unpin(nodeIdOrTitle: string) {
    const node = await this.findNodeByIdOrTitle(nodeIdOrTitle);
    if (!node) {
      throw new Error(`Node not found for identifier: ${nodeIdOrTitle}`);
    }
    await this.keep.unpin(node.id);
    // Refresh cache after write operation to ensure state is updated
    await this.keep.sync(true);
    return `"${node.title || node.id}" unpinned successfully.`;
  }

  async delete(nodeIdOrTitle: string) {
    const node = await this.findNodeByIdOrTitle(nodeIdOrTitle);
    if (!node) {
      throw new Error(`Node not found for identifier: ${nodeIdOrTitle}`);
    }
    await this.keep.delete(node.id);
    // Refresh cache after write operation to ensure state is updated
    await this.keep.sync(true);
    return `"${node.title || node.id}" permanently deleted successfully.`;
  }

  async addListItem(
    listIdOrTitle: string,
    text: string,
    checked = false
  ) {
    // Use fresh data for write operations to ensure we have the latest items
    const lists = await this.keep.allLists(true);
    const targetList = this.findList(lists, listIdOrTitle);

    if (!targetList) {
      throw new Error(`List not found for identifier: ${listIdOrTitle}`);
    }

    const item = targetList.addItem(text, checked);
    await targetList.save();
    
    // Refresh cache after write operation to ensure next operation has fresh data
    await this.keep.sync(true);

    return `Item "${text}" added to list "${targetList.title || targetList.id}" successfully.`;
  }

  async updateListItemText(
    listIdOrTitle: string,
    itemTextOrId: string,
    newText: string
  ) {
    logger.debug(`🔍 [Keep] updateListItemText called:`);
    logger.debug(`   List identifier: "${listIdOrTitle}"`);
    logger.debug(`   Item identifier: "${itemTextOrId}"`);
    logger.debug(`   New text: "${newText}"`);
    
    try {
      // Use fresh data for write operations to ensure we have the latest items
      logger.debug(`📥 [Keep] Fetching all lists (fresh data for write operation)...`);
      const lists = await this.keep.allLists(true);
      logger.debug(`📊 [Keep] Found ${lists.length} total lists`);
      
      if (lists.length > 0) {
        logger.debug(`📋 [Keep] Sample list IDs: ${lists.slice(0, 5).map((l: any) => l.id).join(", ")}`);
        logger.debug(`📋 [Keep] Sample list titles: ${lists.slice(0, 5).map((l: any) => `"${l.title || '(untitled)'}"`).join(", ")}`);
      }
      
      logger.debug(`🔎 [Keep] Searching for list with identifier: "${listIdOrTitle}"`);
      const targetList = this.findList(lists, listIdOrTitle);

      if (!targetList) {
        logger.error(`❌ [Keep] List not found!`);
        logger.error(`   Searched identifier: "${listIdOrTitle}"`);
        logger.error(`   Available list IDs (first 10): ${lists.slice(0, 10).map((l: any) => l.id).join(", ")}`);
        logger.error(`   Available list titles (first 10): ${lists.slice(0, 10).map((l: any) => `"${l.title || '(untitled)'}"`).join(", ")}`);
        throw new Error(`List not found for identifier: ${listIdOrTitle}`);
      }

      logger.debug(`✅ [Keep] Found list: id="${targetList.id}", title="${targetList.title || '(untitled)'}"`);
      logger.debug(`📋 [Keep] List has ${targetList.items?.length || 0} items`);
      
      if (targetList.items && targetList.items.length > 0) {
        logger.debug(`📝 [Keep] List items (first 5):`);
        targetList.items.slice(0, 5).forEach((item: any, idx: number) => {
          logger.debug(`   [${idx}] id="${item.id}", text="${item.text || '(no text)'}", checked=${item.checked}`);
        });
      }

      logger.debug(`🔎 [Keep] Searching for item with identifier: "${itemTextOrId}"`);
      const targetItem = this.findItem(targetList.items || [], itemTextOrId);

      if (!targetItem) {
        logger.error(`❌ [Keep] List item not found!`);
        logger.error(`   Searched identifier: "${itemTextOrId}"`);
        logger.error(`   List: "${targetList.title || targetList.id}"`);
        if (targetList.items && targetList.items.length > 0) {
          logger.error(`   Available item IDs (first 10): ${targetList.items.slice(0, 10).map((i: any) => i.id).join(", ")}`);
          logger.error(`   Available item texts (first 10): ${targetList.items.slice(0, 10).map((i: any) => `"${i.text || '(no text)'}"`).join(", ")}`);
        } else {
          logger.error(`   List has no items!`);
        }
        throw new Error(
          `List item not found in "${targetList.title || targetList.id}" for identifier: ${itemTextOrId}`
        );
      }

      logger.debug(`✅ [Keep] Found item: id="${targetItem.id}", text="${targetItem.text || '(no text)'}"`);
      logger.debug(`✏️ [Keep] Updating item text from "${targetItem.text || '(no text)'}" to "${newText}"`);
      
      targetList.updateItemText(targetItem.id, newText);
      logger.debug(`💾 [Keep] Saving list...`);
      await targetList.save();
      logger.debug(`✅ [Keep] List saved successfully`);
      
      // Refresh cache after write operation to ensure next operation has fresh data
      logger.debug(`🔄 [Keep] Refreshing cache after write operation...`);
      await this.keep.sync(true);
      logger.debug(`✅ [Keep] Cache refreshed`);

      const result = `Item "${targetItem.text || targetItem.id}" updated to "${newText}" in list "${targetList.title || targetList.id}".`;
      logger.debug(`✅ [Keep] updateListItemText completed: ${result}`);
      return result;
    } catch (error) {
      logger.error(`❌ [Keep] Error in updateListItemText:`, error);
      logger.error(`   Error type: ${error instanceof Error ? error.constructor.name : typeof error}`);
      logger.error(`   Error message: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof Error && error.stack) {
        logger.error(`   Error stack: ${error.stack}`);
      }
      throw error;
    }
  }

  async removeListItem(listIdOrTitle: string, itemTextOrId: string) {
    // Use fresh data for write operations to ensure we have the latest items
    const lists = await this.keep.allLists(true);
    const targetList = this.findList(lists, listIdOrTitle);

    if (!targetList) {
      throw new Error(`List not found for identifier: ${listIdOrTitle}`);
    }

    const targetItem = this.findItem(targetList.items || [], itemTextOrId);

    if (!targetItem) {
      throw new Error(
        `List item not found in "${targetList.title || targetList.id}" for identifier: ${itemTextOrId}`
      );
    }

    targetList.removeItem(targetItem.id);
    await targetList.save();
    
    // Refresh cache after write operation to ensure next operation has fresh data
    await this.keep.sync(true);

    return `Item "${targetItem.text || targetItem.id}" removed from list "${targetList.title || targetList.id}" successfully.`;
  }
}

export function createKeepFromEnv() {
  const email = process.env.GOOGLE_KEEP_EMAIL;
  const masterToken = process.env.GOOGLE_KEEP_MASTER_TOKEN;

  if (!email || !masterToken) {
    throw new Error(
      "Google Keep credentials are not set. Please ensure GOOGLE_KEEP_EMAIL and GOOGLE_KEEP_MASTER_TOKEN are configured (via accounts.json)."
    );
  }

  return new GoogleKeepUnofficial({ email, masterToken });
}
