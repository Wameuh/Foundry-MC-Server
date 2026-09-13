import { refreshAutoAnimationsCapabilities } from "./capability-probe";
import { getAutomatedAnimationsApi } from "./detect";
import { autoanimationsUnavailable } from "./errors";

const MENU_KEYS = ["melee", "range", "ontoken", "templatefx", "aura", "preset", "aefx"] as const;

function summarizeEntry(entry: unknown): Record<string, unknown> | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const data = entry as Record<string, unknown>;
  const primary =
    data.primary && typeof data.primary === "object"
      ? (data.primary as Record<string, unknown>)
      : undefined;
  const video =
    primary?.video && typeof primary.video === "object"
      ? (primary.video as Record<string, unknown>)
      : undefined;
  return {
    id: data.id,
    label: data.label,
    menu: data.menu,
    primaryVideo: video
      ? {
          dbSection: video.dbSection,
          menuType: video.menuType,
          animation: video.animation,
          variant: video.variant,
          color: video.color,
        }
      : undefined,
  };
}

export function getAutorecMenus() {
  const capabilities = refreshAutoAnimationsCapabilities();
  if (!capabilities.autorecRead) throw autoanimationsUnavailable(capabilities);
  const api = getAutomatedAnimationsApi();
  if (!api) throw autoanimationsUnavailable(capabilities);

  const raw = api.AutorecManager.getAutorecEntries();
  const menus: Record<string, unknown[]> = {};
  for (const key of MENU_KEYS) {
    const entries = raw[key];
    menus[key] = Array.isArray(entries)
      ? entries.map(summarizeEntry).filter((entry): entry is Record<string, unknown> => Boolean(entry))
      : [];
  }

  return {
    version: typeof raw.version === "number" ? raw.version : undefined,
    menus,
    counts: Object.fromEntries(Object.entries(menus).map(([key, value]) => [key, value.length])),
  };
}
