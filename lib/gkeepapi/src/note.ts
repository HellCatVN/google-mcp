import { randomUUID } from "crypto";
import type { Keep } from "./keep";
import type { ColorValue, Node, NodeSettings, Timestamps2 } from "./types";

export type NodeType = "NOTE" | "LIST" | "LIST_ITEM";

export const DEFAULT_NODE_SETTINGS: NodeSettings = {
  newListItemPlacement: "BOTTOM",
  checkedListItemsPolicy: "GRAVEYARD",
  graveyardState: "COLLAPSED",
};

export const nowIso = () => new Date().toISOString();

export const makeTimestamps = (): Timestamps2 => ({
  kind: "notes#timestamps",
  created: nowIso(),
  updated: nowIso(),
});

export abstract class SerializableNode {
  protected keep?: Keep;
  protected dirty = true;
  protected baseVersion?: number;
  protected archived = false;
  protected pinned = false;
  protected lastModifierEmail?: string;

  constructor(
    public id: string,
    public parentId: string,
    public type: NodeType,
    public timestamps: Timestamps2 = makeTimestamps(),
    public nodeSettings: NodeSettings = { ...DEFAULT_NODE_SETTINGS },
    public color?: ColorValue
  ) {}

  attachKeep(keep: Keep) {
    this.keep = keep;
  }

  markClean(version?: number) {
    this.dirty = false;
    if (version !== undefined) {
      this.baseVersion = version;
    }
    return this;
  }

  touch(edited = false) {
    this.dirty = true;
    const ts = nowIso();
    this.timestamps.updated = ts;
    if (edited) {
      this.timestamps.userEdited = ts;
    }
  }

  trashed() {
    this.timestamps.trashed = nowIso();
    this.dirty = true;
  }

  untrash() {
    // Set trashed to epoch date (1970-01-01) to indicate "not trashed"
    // Google Keep API uses epoch date as sentinel value for "not trashed"
    this.timestamps.trashed = "1970-01-01T00:00:00.000Z";
    this.dirty = true;
  }

  markDeleted() {
    this.timestamps.deleted = nowIso();
    this.dirty = true;
  }

  setArchived(value: boolean) {
    this.archived = value;
    this.touch();
  }

  setPinned(value: boolean) {
    this.pinned = value;
    this.touch();
  }

  get created() {
    return new Date(this.timestamps.created);
  }

  get updated() {
    return this.timestamps.updated ? new Date(this.timestamps.updated) : null;
  }

  get lastModifiedAt() {
    if (this.timestamps.userEdited) return new Date(this.timestamps.userEdited);
    return this.updated;
  }

  abstract toPayload(): Node[];

  async save() {
    if (!this.keep) throw new Error("Node is not attached to Keep instance");
    await this.keep.push(this);
  }
}

export class ListItem extends SerializableNode {
  constructor(
    public text: string,
    public checked = false,
    parentId: string,
    public sortValue: number = Date.now(),
    public parentServerId?: string,
    public superListItemId?: string,
    id = randomUUID()
  ) {
    super(id, parentId, "LIST_ITEM");
  }

  setChecked(value: boolean) {
    this.checked = value;
    this.touch(true);
  }

  setText(value: string) {
    this.text = value;
    this.touch(true);
  }

  toPayload(): Node[] {
    const payload: Node = {
      kind: "notes#node",
      id: this.id,
      parentId: this.parentId,
      type: "LIST_ITEM",
      timestamps: this.timestamps,
      nodeSettings: this.nodeSettings,
      sortValue: `${this.sortValue}`,
      text: this.text,
      checked: this.checked,
    };
    if (this.superListItemId) payload.superListItemId = this.superListItemId;
    if (this.parentServerId) payload.parentServerId = this.parentServerId;
    if (this.baseVersion !== undefined) payload.baseVersion = this.baseVersion;
    return [payload];
  }

  static fromRemote(raw: Node) {
    const item = new ListItem(
      raw.text ?? "",
      raw.checked ?? false,
      raw.parentId,
      raw.sortValue ? Number(raw.sortValue) : Date.now(),
      raw.parentServerId,
      raw.superListItemId,
      raw.id
    );
    item.timestamps = raw.timestamps;
    item.nodeSettings = raw.nodeSettings ?? { ...DEFAULT_NODE_SETTINGS };
    item.baseVersion = raw.baseVersion;
    item.dirty = false;
    return item;
  }
}

export class Note extends SerializableNode {
  private textItem?: ListItem;
  constructor(
    public title = "",
    text = "",
    color: ColorValue | undefined = undefined,
    id = randomUUID()
  ) {
    super(id, "root", "NOTE", makeTimestamps(), { ...DEFAULT_NODE_SETTINGS }, color);
    this.textItem = new ListItem(text, false, id, Date.now());
  }

  get text() {
    return this.textItem?.text ?? "";
  }

  set text(value: string) {
    if (!this.textItem) {
      this.textItem = new ListItem(value, false, this.id, Date.now());
    } else {
      this.textItem.setText(value);
    }
    this.touch(true);
  }

  setTitle(value: string) {
    this.title = value;
    this.touch(true);
  }

  trash() {
    this.trashed();
  }

  restore() {
    this.untrash();
  }

  delete() {
    this.markDeleted();
  }

  setColor(value: ColorValue) {
    this.color = value;
    this.touch();
  }

  toPayload(): Node[] {
    const payload: Node = {
      kind: "notes#node",
      id: this.id,
      parentId: "root",
      type: "NOTE",
      timestamps: this.timestamps,
      nodeSettings: this.nodeSettings,
      title: this.title,
      color: this.color,
      isArchived: this.archived,
      isPinned: this.pinned,
    };
    if (this.baseVersion !== undefined) payload.baseVersion = this.baseVersion;

    const children = this.textItem ? this.textItem.toPayload() : [];
    return [payload, ...children];
  }

  static fromRemote(raw: Node, children: Node[]) {
    const childItem = children.find((c) => c.type === "LIST_ITEM");
    const note = new Note(raw.title ?? "", childItem?.text ?? "", raw.color, raw.id);
    note.timestamps = raw.timestamps;
    note.nodeSettings = raw.nodeSettings ?? { ...DEFAULT_NODE_SETTINGS };
    note.baseVersion = raw.baseVersion;
    note.archived = raw.isArchived ?? false;
    note.pinned = raw.isPinned ?? false;
    note.lastModifierEmail = (raw as any).lastModifierEmail;
    note.dirty = false;
    if (childItem) {
      note.textItem = ListItem.fromRemote(childItem);
      note.textItem.parentId = raw.id;
    }
    return note;
  }
}
