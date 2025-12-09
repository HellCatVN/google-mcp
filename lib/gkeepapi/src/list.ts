import { randomUUID } from "crypto";
import type { ColorValue, Node } from "./types";
import { DEFAULT_NODE_SETTINGS, ListItem, SerializableNode, makeTimestamps } from "./note";

const SORT_DELTA = 10000;

export class List extends SerializableNode {
  private itemsInternal: ListItem[] = [];

  constructor(
    public title = "",
    items: Array<{ text: string; checked?: boolean; sort?: number }> = [],
    color: ColorValue | undefined = undefined,
    id = randomUUID()
  ) {
    super(id, "root", "LIST", makeTimestamps(), { ...DEFAULT_NODE_SETTINGS }, color);
    let sort = Date.now();
    items.forEach((item) => {
      const listItem = new ListItem(
        item.text,
        item.checked ?? false,
        id,
        item.sort ?? sort
      );
      sort -= SORT_DELTA;
      this.itemsInternal.push(listItem);
    });
  }

  get items() {
    return this.itemsInternal;
  }

  addItem(text: string, checked = false, sort?: number) {
    const sortValue = sort ?? (this.itemsInternal.length ? this.itemsInternal[0].sortValue - SORT_DELTA : Date.now());
    const item = new ListItem(text, checked, this.id, sortValue);
    item.attachKeep(this.keep!);
    this.itemsInternal.push(item);
    this.touch(true);
    return item;
  }

  updateItemText(itemId: string, text: string) {
    const item = this.itemsInternal.find((i) => i.id === itemId);
    if (!item) throw new Error(`List item ${itemId} not found`);
    item.setText(text);
    this.touch(true);
    return item;
  }

  setItemChecked(itemId: string, checked: boolean) {
    const item = this.itemsInternal.find((i) => i.id === itemId);
    if (!item) throw new Error(`List item ${itemId} not found`);
    item.setChecked(checked);
    this.touch(true);
    return item;
  }

  removeItem(itemId: string) {
    const item = this.itemsInternal.find((i) => i.id === itemId);
    if (!item) throw new Error(`List item ${itemId} not found`);
    item.markDeleted();
    this.touch(true);
    return item;
  }

  setTitle(value: string) {
    this.title = value;
    this.touch(true);
  }

  setColor(value: ColorValue) {
    this.color = value;
    this.touch();
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

  replaceItems(items: ListItem[]) {
    this.itemsInternal = items;
    this.touch(true);
  }

  toPayload(): Node[] {
    const payload: Node = {
      kind: "notes#node",
      id: this.id,
      parentId: "root",
      type: "LIST",
      timestamps: this.timestamps,
      nodeSettings: this.nodeSettings,
      title: this.title,
      color: this.color,
      isArchived: (this as any).archived,
      isPinned: (this as any).pinned,
    };
    if (this.baseVersion !== undefined) payload.baseVersion = this.baseVersion;

    const children = this.itemsInternal.flatMap((i) => i.toPayload());
    return [payload, ...children];
  }

  static fromRemote(raw: Node, children: Node[]) {
    const list = new List(raw.title ?? "", [], raw.color, raw.id);
    list.timestamps = raw.timestamps;
    list.nodeSettings = raw.nodeSettings ?? { ...DEFAULT_NODE_SETTINGS };
    list.baseVersion = raw.baseVersion;
    (list as any).archived = raw.isArchived ?? false;
    (list as any).pinned = raw.isPinned ?? false;
    list.itemsInternal = children
      .filter((c) => c.type === "LIST_ITEM")
      .map((c) => ListItem.fromRemote(c));
    list.dirty = false;
    return list;
  }
}
