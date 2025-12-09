export interface Root {
  kind: string;
  toVersion: string;
  userInfo: UserInfo;
  nodes: Node[];
  truncated: boolean;
  incremental: boolean;
  forceFullResync: boolean;
  responseHeader: ResponseHeader;
}

export interface UserInfo {
  timestamps: Timestamps;
  settings: Settings;
}

export interface Timestamps {
  kind: string;
  created: string;
}

export interface Settings {
  singleSettings: SingleSetting[];
}
export enum ColorValue {
  White = "DEFAULT",
  Red = "RED",
  Orange = "ORANGE",
  Yellow = "YELLOW",
  Green = "GREEN",
  Teal = "TEAL",
  Blue = "BLUE",
  DarkBlue = "CERULEAN",
  Purple = "PURPLE",
  Pink = "PINK",
  Brown = "BROWN",
  Gray = "GRAY",
}

export interface SingleSetting {
  type: string;
  applicablePlatforms: string[];
  globalCheckedListItemsPolicyValue?: string;
  globalNewListItemPlacementValue?: string;
  layoutStyleValue?: string;
  webEmbedsEnabledValue?: boolean;
  sharingEnabledValue?: boolean;
  webAppThemeValue?: string;
}

export interface Node {
  kind: string;
  id: string;
  serverId?: string;
  parentId: string;
  type: "LIST" | "LIST_ITEM" | "NOTE";
  timestamps: Timestamps2;
  title?: string;
  nodeSettings: NodeSettings;
  isArchived?: boolean;
  isPinned?: boolean;
  color?: ColorValue;
  sortValue?: string;
  annotationsGroup: AnnotationsGroup;
  lastModifierEmail?: string;
  moved?: string;
  baseNoteRevision?: string;
  xplatModel?: boolean;
  representation?: string;
  shareState?: string;
  roleInfo?: RoleInfo[];
  parentServerId?: string;
  text?: string;
  checked?: boolean;
  superListItemId?: string;
  baseVersion?: number;
}

export interface Timestamps2 {
  kind: string;
  created: string;
  updated: string;
  userEdited?: string;
  trashed?: string;
  shareRequestProcessed?: string;
  recentSharedChangesSeen?: string;
  deleted?: string;
}

export interface NodeSettings {
  newListItemPlacement: string;
  checkedListItemsPolicy: string;
  graveyardState: string;
}

export interface AnnotationsGroup {
  kind: string;
  annotations?: Annotation[];
}

export interface Annotation {
  id: string;
  deleted?: string;
  topicCategory: TopicCategory;
}

export interface TopicCategory {
  category: string;
}

export interface RoleInfo {
  email: string;
  role: string;
  type: string;
  auxiliary_type: string;
}

export interface ResponseHeader {
  updateState: string;
  requestId: string;
  experimentIds: number[];
}
