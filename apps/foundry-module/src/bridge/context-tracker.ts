import type { DocumentReference, FoundryContext } from "@foundry-mcp/protocol";
import { toDocumentReference } from "../operations/document-reference";

class ContextTracker {
  private viewedDocument: DocumentReference | undefined;
  private hookIds: Array<[string, number]> = [];

  start(): void {
    this.stop();
    const track = (...args: unknown[]) => {
      const application = args[0] as { document?: FoundryDocument } | undefined;
      if (application?.document) this.viewedDocument = toDocumentReference(application.document);
    };
    this.hookIds.push(["renderActorSheet", Hooks.on("renderActorSheet", track)]);
    this.hookIds.push(["renderItemSheet", Hooks.on("renderItemSheet", track)]);
    this.hookIds.push(["closeActorSheet", Hooks.on("closeActorSheet", () => { this.viewedDocument = undefined; })]);
    this.hookIds.push(["closeItemSheet", Hooks.on("closeItemSheet", () => { this.viewedDocument = undefined; })]);
  }

  stop(): void {
    for (const [hook, id] of this.hookIds) Hooks.off(hook, id);
    this.hookIds = [];
  }

  snapshot(): FoundryContext {
    const selectedTokens = (canvas?.tokens?.controlled ?? []).map((token) => ({
      tokenUuid: token.document.uuid,
      ...(token.actor ? { actorUuid: token.actor.uuid } : {}),
      name: token.document.name ?? token.document.id,
    }));
    return {
      ...(canvas?.scene ? { activeScene: toDocumentReference(canvas.scene) } : {}),
      ...(this.viewedDocument ? { viewedDocument: this.viewedDocument } : {}),
      selectedTokens,
    };
  }
}

export const contextTracker = new ContextTracker();
