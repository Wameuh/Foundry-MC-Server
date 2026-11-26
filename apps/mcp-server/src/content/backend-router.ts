import { BridgeOperation } from "@foundry-mcp/protocol";

import type { OperationRouter } from "../mcp/tools/shared.js";
import type { ContentBackendOperations } from "./importer.js";
import type { JsonRecord } from "./types.js";

export class RouterContentBackend implements ContentBackendOperations {
  constructor(private readonly router: OperationRouter) {}

  searchDocuments(payload: JsonRecord): Promise<JsonRecord> {
    return this.router.route(BridgeOperation.SEARCH_DOCUMENTS, payload, { tool: "content_import_commit" }) as Promise<JsonRecord>;
  }

  getDocument(payload: JsonRecord): Promise<JsonRecord> {
    return this.router.route(BridgeOperation.GET_DOCUMENT, payload, { tool: "content_import_commit" }) as Promise<JsonRecord>;
  }

  createDocuments(payload: JsonRecord): Promise<JsonRecord> {
    return this.router.route(BridgeOperation.CREATE_DOCUMENTS, payload, { tool: "content_import_commit" }) as Promise<JsonRecord>;
  }

  updateDocuments(payload: JsonRecord): Promise<JsonRecord> {
    return this.router.route(BridgeOperation.UPDATE_DOCUMENTS, payload, { tool: "content_import_commit" }) as Promise<JsonRecord>;
  }

  createEmbedded(payload: JsonRecord): Promise<JsonRecord> {
    return this.router.route(BridgeOperation.CREATE_EMBEDDED, payload, { tool: "content_import_commit" }) as Promise<JsonRecord>;
  }

  updateEmbedded(payload: JsonRecord): Promise<JsonRecord> {
    return this.router.route(BridgeOperation.UPDATE_EMBEDDED, payload, { tool: "content_import_commit" }) as Promise<JsonRecord>;
  }
}
