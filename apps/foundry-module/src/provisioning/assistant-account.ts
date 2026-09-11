import { MODULE_ID } from "../settings/register-settings";

export const ASSISTANT_USER_NAME = "MCP Bridge GM";

type ExistingUser = { isFullGamemaster: boolean };

export interface AssistantProvisioningGateway {
  isFullGamemaster(): boolean;
  isEnabled(): boolean;
  findUser(name: string): ExistingUser | undefined;
  confirmCreation(name: string): Promise<boolean>;
  createGamemaster(name: string, accessKey: string): Promise<void>;
  showCredentials(configuration: string): Promise<void>;
  disable(): Promise<void>;
  warn(message: string): void;
  error(message: string): void;
  generateAccessKey(): string;
}

export async function provisionAssistantAccount(gateway: AssistantProvisioningGateway): Promise<"created" | "dismissed" | "skipped"> {
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
    await gateway.createGamemaster(ASSISTANT_USER_NAME, accessKey);
    await gateway.disable();
    await gateway.showCredentials(buildHeadlessEnvironment(ASSISTANT_USER_NAME, accessKey));
    return "created";
  } catch (error) {
    gateway.error(`Foundry MCP: unable to create the assistant account: ${error instanceof Error ? error.message : String(error)}`);
    return "skipped";
  }
}

export function buildHeadlessEnvironment(username: string, accessKey: string): string {
  return [
    "FOUNDRY_HEADLESS_ENABLED=true",
    `FOUNDRY_HEADLESS_USERNAME=${username}`,
    `FOUNDRY_HEADLESS_ACCESS_KEY=${accessKey}`,
  ].join("\n");
}

export function createFoundryProvisioningGateway(): AssistantProvisioningGateway {
  return {
    isFullGamemaster: () => game.user?.role === CONST.USER_ROLES.GAMEMASTER,
    isEnabled: () => game.settings.get(MODULE_ID, "offerAssistantSetup") === true,
    findUser: (name) => {
      const user = game.users?.contents.find((candidate) => candidate.name === name);
      return user ? { isFullGamemaster: user.role === CONST.USER_ROLES.GAMEMASTER } : undefined;
    },
    confirmCreation: async (name) => foundry.applications.api.DialogV2.confirm({
      window: { title: "Foundry MCP — assistant account" },
      content: [
        `<p>Create the dedicated Foundry user <strong>${escapeHtml(name)}</strong>?</p>`,
        "<p>This user will have the Gamemaster role so the headless MCP session can manage the world.</p>",
        "<p>No account is created unless you confirm.</p>",
      ].join(""),
      yes: { label: "Create assistant", icon: "fa-solid fa-robot" },
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
    },
    showCredentials: async (configuration) => {
      await foundry.applications.api.DialogV2.wait({
        window: { title: "Foundry MCP — save these credentials" },
        position: { width: 620 },
        form: { closeOnSubmit: false },
        content: [
          "<p><strong>This access key is shown only once.</strong> Copy this block into the MCP server <code>.env</code> file.</p>",
          `<textarea readonly style="width:100%;min-height:9rem;font-family:monospace">${escapeHtml(configuration)}</textarea>`,
        ].join(""),
        buttons: [{
          action: "copy",
          label: "Copy and close",
          icon: "fa-solid fa-copy",
          default: true,
          callback: async (_event: unknown, _button: unknown, dialog: { close(): Promise<unknown> }) => {
            try {
              if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
              await navigator.clipboard.writeText(configuration);
              ui.notifications?.info("Foundry MCP: headless credentials copied.");
              await dialog.close();
            } catch {
              ui.notifications?.warn("Foundry MCP: automatic copy is unavailable. Select and copy the text manually before closing.");
            }
          },
        }, {
          action: "close",
          label: "Close",
          icon: "fa-solid fa-xmark",
          callback: async (_event: unknown, _button: unknown, dialog: { close(): Promise<unknown> }) => {
            await dialog.close();
          },
        }],
        modal: true,
        rejectClose: false,
      });
    },
    disable: async () => { await game.settings.set(MODULE_ID, "offerAssistantSetup", false); },
    warn: (message) => ui.notifications?.warn(message),
    error: (message) => ui.notifications?.error(message),
    generateAccessKey: () => {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    },
  };
}

export async function offerAssistantAccountProvisioning(): Promise<void> {
  await provisionAssistantAccount(createFoundryProvisioningGateway());
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
