import fetch from "node-fetch";
import { getOAuthToken } from "./oAuthToken";
import type { Node, Root } from "./types";
import { List } from "./list";
import { Note, SerializableNode } from "./note";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import logger from "../../../utils/logger.js";

type TopLevel = Note | List;

export default class Keep {
  private authorization: Promise<string>;
  private email: string;
  private encryptedPassword: string;
  private keepVersion?: string;
  private topLevelNodes: Map<string, TopLevel> = new Map();

  constructor(email: string, encryptedPassword: string, skipAuth = false) {
    this.email = email;
    this.encryptedPassword = encryptedPassword;
    this.authorization = skipAuth
      ? Promise.resolve("OAuth test")
      : this.createAuthorization();
  }

  private createAuthorization() {
    return (async () => {
      const token = await getOAuthToken(this.email, this.encryptedPassword);
      return `OAuth ${token}`;
    })();
  }

  private async getAuthorization() {
    if (!this.authorization) {
      this.authorization = this.createAuthorization();
    }
    return this.authorization;
  }

  private async callChanges(nodes: Array<Node>) {
      const attempt = async (body: any) => {
        const Authorization = await this.getAuthorization();
        const response = await fetch("https://www.googleapis.com/notes/v1/changes", {
          headers: { Authorization },
          body: JSON.stringify(body),
          method: "POST",
        });
        if (response.status === 401) {
          // Re-authenticate and retry once
          this.authorization = this.createAuthorization();
          const newAuthorization = await this.getAuthorization();
          const retryResponse = await fetch("https://www.googleapis.com/notes/v1/changes", {
            headers: { Authorization: newAuthorization },
            body: JSON.stringify(body),
            method: "POST",
          });
          if (retryResponse.status !== 200) {
            const txt = await retryResponse.text();
            logger.error(`❌ [Keep API] API error after re-auth: ${retryResponse.status} ${retryResponse.statusText}`);
            logger.error(`   Response body:`, txt);
            throw new Error(
              "Error while contacting Keep api: " + retryResponse.statusText + "\n\n" + txt
            );
          }
          const responseText = await retryResponse.text();
          logger.debug(`📥 [Keep API] Raw response length: ${responseText.length} characters`);
          
          try {
            const parsed = JSON.parse(responseText) as Root;
            logger.debug(`✅ [Keep API] Response parsed successfully`);
            
            // Save API response to JSON file for debugging (when listing notes)
            try {
              const logDir = join(process.cwd(), "logs", "keep-api");
              await mkdir(logDir, { recursive: true });
              const filename = join(logDir, "api-response.json");
              
              const responseData = {
                timestamp: new Date().toISOString(),
                requestBody: body,
                responseLength: responseText.length,
                response: parsed,
              };
              
              await writeFile(filename, JSON.stringify(responseData, null, 2), "utf-8");
              logger.debug(`💾 [Keep API] Response saved to: ${filename}`);
            } catch (saveError) {
              logger.warn(`⚠️ [Keep API] Failed to save response to file:`, saveError);
              // Don't fail the request if file saving fails
            }
            
            return parsed;
          } catch (parseError) {
            logger.error(`❌ [Keep API] JSON parse error:`, parseError);
            logger.error(`   Response text (first 500 chars):`, responseText.substring(0, 500));
            throw new Error(`Failed to parse API response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
          }
        }
      if (response.status !== 200) {
        const txt = await response.text();
        logger.error(`❌ [Keep API] API error: ${response.status} ${response.statusText}`);
        logger.error(`   Response body:`, txt);
        throw new Error(
          "Error while contacting Keep api: " + response.statusText + "\n\n" + txt
        );
      }
      const responseText = await response.text();
      logger.debug(`📥 [Keep API] Raw response length: ${responseText.length} characters`);
      
      try {
        const parsed = JSON.parse(responseText) as Root;
        logger.debug(`✅ [Keep API] Response parsed successfully`);
        
        // Save API response to JSON file for debugging (when listing notes)
        try {
          const logDir = join(process.cwd(), "logs", "keep-api");
          await mkdir(logDir, { recursive: true });
          const filename = join(logDir, "api-response.json");
          
          const responseData = {
            timestamp: new Date().toISOString(),
            requestBody: body,
            responseLength: responseText.length,
            response: parsed,
          };
          
          await writeFile(filename, JSON.stringify(responseData, null, 2), "utf-8");
          logger.debug(`💾 [Keep API] Response saved to: ${filename}`);
        } catch (saveError) {
          logger.warn(`⚠️ [Keep API] Failed to save response to file:`, saveError);
          // Don't fail the request if file saving fails
        }
        
        return parsed;
      } catch (parseError) {
        logger.error(`❌ [Keep API] JSON parse error:`, parseError);
        logger.error(`   Response text (first 500 chars):`, responseText.substring(0, 500));
        throw new Error(`Failed to parse API response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }
    };

    let truncated = true;
    let targetVersion = this.keepVersion;
    while (truncated) {
      const body = {
        nodes,
        targetVersion,
        clientTimestamp: new Date().toISOString(),
        requestHeader: {
          clientSessionId: "123",
          clientPlatform: "ANDROID",
          clientVersion: { major: "9", minor: "9", build: "9", revision: "9" },
          capabilities: [
            "NC",
            "PI",
            "LB",
            "AN",
            "SH",
            "DR",
            "TR",
            "IN",
            "SNB",
            "MI",
            "CO",
          ].map((type) => ({ type })),
        },
      };

      const root = await attempt(body);
      logger.debug(`📥 [Keep API] API response received:`, {
        hasNodes: !!root.nodes,
        nodesLength: root.nodes?.length ?? 0,
        truncated: root.truncated,
        toVersion: root.toVersion,
        rootKeys: Object.keys(root),
      });
      if (root.nodes) {
        logger.debug(`📋 [Keep API] First few node types:`, root.nodes.slice(0, 5).map((n: any) => n.type));
      } else {
        logger.warn(`⚠️ [Keep API] root.nodes is undefined or null! Full response:`, JSON.stringify(root, null, 2));
      }
      this.hydrate(root);
      truncated = root.truncated;
      targetVersion = root.toVersion;
      nodes = []; // only send mutations once; subsequent pages only fetch.
    }
  }

  private attachKeep(node: SerializableNode) {
    node.attachKeep(this);
    if (node instanceof List) {
      node.items.forEach((i) => i.attachKeep(this));
    }
  }

  private hydrate(root: Root) {
    logger.debug(`🔄 [Keep API] hydrate called`);
    logger.debug(`   root.toVersion: ${root.toVersion}`);
    logger.debug(`   root.nodes exists: ${!!root.nodes}`);
    logger.debug(`   root.nodes type: ${Array.isArray(root.nodes) ? 'array' : typeof root.nodes}`);
    logger.debug(`   root.nodes length: ${root.nodes?.length ?? 'N/A'}`);
    
    if (!root.nodes) {
      logger.warn(`⚠️ [Keep API] root.nodes is undefined/null, using empty array`);
      root.nodes = [];
    }
    
    if (!Array.isArray(root.nodes)) {
      logger.error(`❌ [Keep API] root.nodes is not an array! Type: ${typeof root.nodes}, Value:`, root.nodes);
      throw new Error(`Invalid API response: root.nodes is not an array (type: ${typeof root.nodes})`);
    }

    this.keepVersion = root.toVersion;
    const nextMap = new Map(this.topLevelNodes);

    const childrenByParent = new Map<string, Node[]>();
    root.nodes.forEach((n) => {
      const bucket = childrenByParent.get(n.parentId) ?? [];
      bucket.push(n);
      childrenByParent.set(n.parentId, bucket);
    });

    const topLevelNodes = root.nodes.filter((n) => n.parentId === "root" && (n.type === "NOTE" || n.type === "LIST"));
    logger.debug(`📊 [Keep API] Found ${topLevelNodes.length} top-level nodes (NOTE or LIST)`);
    
    topLevelNodes.forEach((node) => {
      const children = childrenByParent.get(node.id) ?? [];
      const instance =
        node.type === "NOTE"
          ? Note.fromRemote(node, children)
          : List.fromRemote(node, children);
      this.attachKeep(instance);
      
      // Log trashed status for debugging
      const trashedTs = instance.timestamps.trashed;
      if (trashedTs) {
        const trashedDate = new Date(trashedTs);
        const epochDate = new Date("1970-01-01T00:00:00.000Z");
        const isActuallyTrashed = trashedDate.getTime() > epochDate.getTime();
        logger.debug(`   Node ${node.id} (${node.type}): trashed="${trashedTs}", isTrashed=${isActuallyTrashed}`);
      }
      
      if (instance.timestamps.deleted) {
        nextMap.delete(node.id);
        logger.debug(`   Node ${node.id} deleted, removing from cache`);
      } else {
        const existing = nextMap.get(node.id);
        if (existing) {
          logger.debug(`   Node ${node.id} updated in cache`);
        } else {
          logger.debug(`   Node ${node.id} added to cache`);
        }
        nextMap.set(node.id, instance);
      }
    });

    this.topLevelNodes = nextMap;
    logger.debug(`✅ [Keep API] hydrate completed, ${nextMap.size} nodes in map`);
  }

  async sync(forceRefresh = false) {
    // Sync if forceRefresh is true, or if we don't have a version (first time or after reset)
    if (forceRefresh || !this.keepVersion) {
      if (forceRefresh) {
        // Reset version to force full sync
        this.keepVersion = undefined;
      }
      await this.callChanges([]);
    }
  }

  async all(forceRefresh = false): Promise<TopLevel[]> {
    await this.sync(forceRefresh);
    return Array.from(this.topLevelNodes.values());
  }

  async allNotes(forceRefresh = false) {
    return (await this.all(forceRefresh)).filter((node) => node instanceof Note) as Note[];
  }

  async allLists(forceRefresh = false) {
    return (await this.all(forceRefresh)).filter((node) => node instanceof List) as List[];
  }

  createNote(title = "", text = "", color?: Node["color"]) {
    const note = new Note(title, text, color);
    this.attachKeep(note);
    this.topLevelNodes.set(note.id, note);
    return note;
  }

  createList(
    title = "",
    items: Array<{ text: string; checked?: boolean; sort?: number }> = [],
    color?: Node["color"]
  ) {
    const list = new List(title, items, color);
    this.attachKeep(list);
    this.topLevelNodes.set(list.id, list);
    return list;
  }

  async push(node: SerializableNode) {
    const payload = node.toPayload();
    await this.callChanges(payload);
  }

  get(id: string) {
    return this.topLevelNodes.get(id);
  }

  async trash(nodeId: string) {
    const node = this.get(nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found`);
    if (node instanceof Note || node instanceof List) {
      node.trash();
    }
    await node.save();
  }

  async restore(nodeId: string) {
    const node = this.get(nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found`);
    if (node instanceof Note || node instanceof List) {
      node.restore();
    }
    await node.save();
  }

  async archive(nodeId: string) {
    const node = this.get(nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found`);
    if (node instanceof Note || node instanceof List) {
      node.setArchived(true);
    }
    await node.save();
  }

  async unarchive(nodeId: string) {
    const node = this.get(nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found`);
    if (node instanceof Note || node instanceof List) {
      node.setArchived(false);
    }
    await node.save();
  }

  async pin(nodeId: string) {
    const node = this.get(nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found`);
    if (node instanceof Note || node instanceof List) {
      node.setPinned(true);
    }
    await node.save();
  }

  async unpin(nodeId: string) {
    const node = this.get(nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found`);
    if (node instanceof Note || node instanceof List) {
      node.setPinned(false);
    }
    await node.save();
  }

  async delete(nodeId: string) {
    const node = this.get(nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found`);
    if (node instanceof Note || node instanceof List) {
      node.delete();
    }
    await node.save();
    this.topLevelNodes.delete(nodeId);
    await this.sync(true);
  }
}
