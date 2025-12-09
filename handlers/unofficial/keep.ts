import { GoogleKeepUnofficial } from "../../utils/unofficial/keep.js";
import {
  isKeepListNotesArgs,
  isKeepToggleItemArgs,
  isKeepUpdateListArgs,
  isKeepGetNoteArgs,
  isKeepUpdateNoteArgs,
  isKeepCreateNoteArgs,
  isKeepCreateListArgs,
  isKeepNodeIdOrTitleArgs,
  isKeepAddListItemArgs,
  isKeepUpdateListItemTextArgs,
  isKeepRemoveListItemArgs,
} from "../../utils/helper.js";

export async function handleKeepListNotes(
  args: any,
  keep: GoogleKeepUnofficial
) {
  if (!isKeepListNotesArgs(args)) {
    throw new Error("Invalid arguments for google_keep_unofficial_list_notes");
  }

  const { filterType, query, includeItems, forceRefresh } = args;
  const result = await keep.listNotes({ filterType, query, includeItems, forceRefresh });
  return {
    content: [{ type: "text", text: result }],
    isError: false,
  };
}

export async function handleKeepToggleItem(
  args: any,
  keep: GoogleKeepUnofficial
) {
  if (!isKeepToggleItemArgs(args)) {
    throw new Error("Invalid arguments for google_keep_unofficial_toggle_item");
  }

  const { listIdOrTitle, itemTextOrId, checked } = args;
  const result = await keep.toggleListItem(listIdOrTitle, itemTextOrId, checked);
  return {
    content: [{ type: "text", text: result }],
    isError: false,
  };
}

export async function handleKeepUpdateList(
  args: any,
  keep: GoogleKeepUnofficial
) {
  if (!isKeepUpdateListArgs(args)) {
    throw new Error("Invalid arguments for google_keep_unofficial_update_list");
  }

  if (!args.title && !args.color) {
    throw new Error("Provide a new title or color to update the list.");
  }

  const { listIdOrTitle, title, color } = args;
  const result = await keep.updateList(listIdOrTitle, { title, color });
  return {
    content: [{ type: "text", text: result }],
    isError: false,
  };
}

export async function handleKeepGetNote(
  args: any,
  keep: GoogleKeepUnofficial
) {
  console.log(`📝 [Keep] handleKeepGetNote called with args:`, JSON.stringify(args, null, 2));
  
  if (!isKeepGetNoteArgs(args)) {
    console.error(`❌ [Keep] Invalid arguments for google_keep_unofficial_get_note:`, args);
    throw new Error("Invalid arguments for google_keep_unofficial_get_note");
  }
  
  const { noteIdOrTitle, forceRefresh } = args;
  console.log(`🔍 [Keep] Looking for note with identifier: "${noteIdOrTitle}"`);
  if (forceRefresh) {
    console.log(`🔄 [Keep] Force refresh requested by user`);
  }
  
  try {
    const result = await keep.getNoteDetails(noteIdOrTitle, forceRefresh);
    console.log(`✅ [Keep] Successfully retrieved note details (length: ${result.length})`);
    return {
      content: [{ type: "text", text: result }],
      isError: false,
    };
  } catch (error) {
    console.error(`❌ [Keep] Error in getNoteDetails:`, error);
    console.error(`   Error message: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`   Error stack: ${error instanceof Error ? error.stack : 'N/A'}`);
    throw error;
  }
}

export async function handleKeepUpdateNote(
  args: any,
  keep: GoogleKeepUnofficial
) {
  if (!isKeepUpdateNoteArgs(args)) {
    throw new Error("Invalid arguments for google_keep_unofficial_update_note");
  }
  const { noteIdOrTitle, title, text, color } = args;
  if (!title && text === undefined && !color) {
    throw new Error("Provide at least one of: title, text, color.");
  }
  const result = await keep.updateNote(noteIdOrTitle, { title, text, color });
  return {
    content: [{ type: "text", text: result }],
    isError: false,
  };
}

export async function handleKeepCreateNote(
  args: any,
  keep: GoogleKeepUnofficial
) {
  if (!isKeepCreateNoteArgs(args)) {
    throw new Error("Invalid arguments for google_keep_unofficial_create_note");
  }
  const { title, text, color } = args;
  const result = await keep.createNote(title || "", text || "", color);
  return {
    content: [{ type: "text", text: result }],
    isError: false,
  };
}

export async function handleKeepCreateList(
  args: any,
  keep: GoogleKeepUnofficial
) {
  if (!isKeepCreateListArgs(args)) {
    throw new Error("Invalid arguments for google_keep_unofficial_create_list");
  }
  const { title, items, color } = args;
  const result = await keep.createList(title || "", items || [], color);
  return {
    content: [{ type: "text", text: result }],
    isError: false,
  };
}

export async function handleKeepTrash(
  args: any,
  keep: GoogleKeepUnofficial
) {
  if (!isKeepNodeIdOrTitleArgs(args)) {
    throw new Error("Invalid arguments for google_keep_unofficial_trash");
  }
  const { nodeIdOrTitle } = args;
  const result = await keep.trash(nodeIdOrTitle);
  return {
    content: [{ type: "text", text: result }],
    isError: false,
  };
}

export async function handleKeepRestore(
  args: any,
  keep: GoogleKeepUnofficial
) {
  if (!isKeepNodeIdOrTitleArgs(args)) {
    throw new Error("Invalid arguments for google_keep_unofficial_restore");
  }
  const { nodeIdOrTitle } = args;
  const result = await keep.restore(nodeIdOrTitle);
  return {
    content: [{ type: "text", text: result }],
    isError: false,
  };
}

export async function handleKeepArchive(
  args: any,
  keep: GoogleKeepUnofficial
) {
  if (!isKeepNodeIdOrTitleArgs(args)) {
    throw new Error("Invalid arguments for google_keep_unofficial_archive");
  }
  const { nodeIdOrTitle } = args;
  const result = await keep.archive(nodeIdOrTitle);
  return {
    content: [{ type: "text", text: result }],
    isError: false,
  };
}

export async function handleKeepUnarchive(
  args: any,
  keep: GoogleKeepUnofficial
) {
  if (!isKeepNodeIdOrTitleArgs(args)) {
    throw new Error("Invalid arguments for google_keep_unofficial_unarchive");
  }
  const { nodeIdOrTitle } = args;
  const result = await keep.unarchive(nodeIdOrTitle);
  return {
    content: [{ type: "text", text: result }],
    isError: false,
  };
}

export async function handleKeepPin(
  args: any,
  keep: GoogleKeepUnofficial
) {
  if (!isKeepNodeIdOrTitleArgs(args)) {
    throw new Error("Invalid arguments for google_keep_unofficial_pin");
  }
  const { nodeIdOrTitle } = args;
  const result = await keep.pin(nodeIdOrTitle);
  return {
    content: [{ type: "text", text: result }],
    isError: false,
  };
}

export async function handleKeepUnpin(
  args: any,
  keep: GoogleKeepUnofficial
) {
  if (!isKeepNodeIdOrTitleArgs(args)) {
    throw new Error("Invalid arguments for google_keep_unofficial_unpin");
  }
  const { nodeIdOrTitle } = args;
  const result = await keep.unpin(nodeIdOrTitle);
  return {
    content: [{ type: "text", text: result }],
    isError: false,
  };
}

export async function handleKeepDelete(
  args: any,
  keep: GoogleKeepUnofficial
) {
  if (!isKeepNodeIdOrTitleArgs(args)) {
    throw new Error("Invalid arguments for google_keep_unofficial_delete");
  }
  const { nodeIdOrTitle } = args;
  const result = await keep.delete(nodeIdOrTitle);
  return {
    content: [{ type: "text", text: result }],
    isError: false,
  };
}

export async function handleKeepAddListItem(
  args: any,
  keep: GoogleKeepUnofficial
) {
  if (!isKeepAddListItemArgs(args)) {
    throw new Error("Invalid arguments for google_keep_unofficial_add_list_item");
  }
  const { listIdOrTitle, text, checked } = args;
  const result = await keep.addListItem(listIdOrTitle, text, checked || false);
  return {
    content: [{ type: "text", text: result }],
    isError: false,
  };
}

export async function handleKeepUpdateListItemText(
  args: any,
  keep: GoogleKeepUnofficial
) {
  console.log(`📝 [Keep] handleKeepUpdateListItemText called with args:`, JSON.stringify(args, null, 2));
  
  if (!isKeepUpdateListItemTextArgs(args)) {
    console.error(`❌ [Keep] Invalid arguments for google_keep_unofficial_update_list_item_text:`, args);
    throw new Error("Invalid arguments for google_keep_unofficial_update_list_item_text");
  }
  
  const { listIdOrTitle, itemTextOrId, newText } = args;
  console.log(`🔍 [Keep] Updating list item:`);
  console.log(`   List identifier: "${listIdOrTitle}"`);
  console.log(`   Item identifier: "${itemTextOrId}"`);
  console.log(`   New text: "${newText}"`);
  
  try {
    const result = await keep.updateListItemText(listIdOrTitle, itemTextOrId, newText);
    console.log(`✅ [Keep] Successfully updated list item: ${result}`);
    return {
      content: [{ type: "text", text: result }],
      isError: false,
    };
  } catch (error) {
    console.error(`❌ [Keep] Error in updateListItemText:`, error);
    console.error(`   Error message: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`   Error stack: ${error instanceof Error ? error.stack : 'N/A'}`);
    throw error;
  }
}

export async function handleKeepRemoveListItem(
  args: any,
  keep: GoogleKeepUnofficial
) {
  if (!isKeepRemoveListItemArgs(args)) {
    throw new Error("Invalid arguments for google_keep_unofficial_remove_list_item");
  }
  const { listIdOrTitle, itemTextOrId } = args;
  const result = await keep.removeListItem(listIdOrTitle, itemTextOrId);
  return {
    content: [{ type: "text", text: result }],
    isError: false,
  };
}
