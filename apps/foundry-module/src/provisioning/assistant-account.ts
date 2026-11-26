import { MODULE_ID } from "../settings/register-settings";

export const ASSISTANT_USER_NAME = "MCP Bridge GM";

type ExistingUser = { isFullGamemaster: boolean };
type ServiceAccountCredentials = { userId: string; username: string; password: string };
type ServiceAccountSender = { sendServiceAccountProvision(credentials: ServiceAccountCredentials): void };

export interface AssistantProvisioningGateway {
  isFullGamemaster(): boolean;
  isEnabled(): boolean;
  findUser(name: string): ExistingUser | undefined;
  confirmCreation(name: string): Promise<boolean>;
  createGamemaster(name: string, accessKey: string): Promise<string>;
  sendServiceAccount(credentials: ServiceAccountCredentials): boolean;
  notifyProvisioned(): void;
  disable(): Promise<void>;
  warn(message: string): void;
  error(message: string): void;
  generateAccessKey(): string;
}

export async function provisionAssistantAccount(
  gateway: AssistantProvisioningGateway
): Promise<"created" | "dismissed" | "skipped"> {
  if (!gateway.isFullGamemaster() || !gateway.isEnabled()) return "skipped";

  const existing = gateway.findUser(ASSISTANT_USER_NAME);
  if (existing) {
    if (!existing.isFullGamemaster) {
      gateway.warn(`Foundry MCP: the existing user “${ASSISTANT_USER_NAME}” is not a full Gamemaster.`);
    }
    await gateway.disable();
    return "skipped";
  }

  if (!await gateway.confirmCreation(ASSISTANT_USER_NAME)) {
    await gateway.disable();
    return "dismissed";
  }

  const accessKey = gateway.generateAccessKey();
  try {
    const userId = await gateway.createGamemaster(ASSISTANT_USER_NAME, accessKey);
    if (!userId) throw new Error("Foundry did not return the created user id");
    if (!gateway.sendServiceAccount({ userId, username: ASSISTANT_USER_NAME, password: accessKey })) {
      throw new Error("the backend control channel is unavailable");
    }
    await gateway.disable();
    gateway.notifyProvisioned();
    return "created";
  } catch (error) {
    gateway.error(`Foundry MCP: unable to create the assistant account: ${error instanceof Error ? error.message : String(error)}`);
    return "skipped";
  }
}

export function createFoundryProvisioningGateway(sender?: ServiceAccountSender): AssistantProvisioningGateway {
  return {
    isFullGamemaster: () => game.user?.role === CONST.USER_ROLES.GAMEMASTER,
    isEnabled: () => game.settings.get(MODULE_ID, "offerAssistantSetup") === true,
    findUser: (name) => {
      const user = game.users?.contents.find((candidate) => candidate.name === name);
      return user ? { isFullGamemaster: user.role === CONST.USER_ROLES.GAMEMASTER } : undefined;
    },
    confirmCreation: async (name) => foundry.applications.api.DialogV2.confirm({
      window: { title: "Foundry MCP — backend service account" },
      content: [
        `<p>Create the dedicated Foundry user <strong>${escapeHtml(name)}</strong>?</p>`,
        "<p>This Gamemaster account is used only by the backend service. Its generated password is transmitted over the authenticated control channel and is never displayed.</p>",
        "<p>No account is created unless you confirm.</p>",
      ].join(""),
      yes: { label: "Create service account", icon: "fa-solid fa-robot" },
      no: { label: "Do not ask again", icon: "fa-solid fa-xmark" },
      modal: true,
      rejectClose: false,
    }),
    createGamemaster: async (name, accessKey) => {
      const UserDocument = getDocumentClass("User");
      if (!UserDocument) throw new Error("Foundry User document class is unavailable");
      const created = await UserDocument.createDocuments([{
        name,
        role: CONST.USER_ROLES.GAMEMASTER,
        password: accessKey,
      }]);
      if (created.length !== 1) throw new Error("Foundry did not return the created user");
      const user = created[0] as unknown as { id?: unknown; _id?: unknown };
      return String(user.id ?? user._id ?? "");
    },
    sendServiceAccount: (credentials) => {
      if (!sender) return false;
      sender.sendServiceAccountProvision(credentials);
      return true;
    },
    notifyProvisioned: () => ui.notifications?.info("Foundry MCP: service account sent securely to the backend."),
    disable: async () => { await game.settings.set(MODULE_ID, "offerAssistantSetup", false); },
    warn: (message) => ui.notifications?.warn(message),
    error: (message) => ui.notifications?.error(message),
    generateAccessKey: () => {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    },
  };
}

export async function offerAssistantAccountProvisioning(sender?: ServiceAccountSender): Promise<void> {
  await provisionAssistantAccount(createFoundryProvisioningGateway(sender));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}
