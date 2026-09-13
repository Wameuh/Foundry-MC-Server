import {
  AUTOANIMATIONS_FLAG_VERSION,
  AUTOANIMATIONS_MODULE_ID,
} from "./detect";
import type { AutoAnimationsMenu, AutoAnimationsVideo } from "./types";

type SoundData = {
  enable: boolean;
  delay: number;
  file?: string;
  repeat: number;
  repeatDelay: number;
  startTime: number;
  volume: number;
};

function sound(overrides: Partial<SoundData> = {}): SoundData {
  return {
    enable: false,
    delay: 0,
    repeat: 1,
    repeatDelay: 250,
    startTime: 0,
    volume: 0.75,
    ...overrides,
  };
}

function defaultVideo(section: string): Record<string, unknown> {
  return {
    dbSection: section,
    menuType: "spell",
    animation: "curewounds",
    variant: "01",
    color: "blue",
    enableCustom: false,
    customPath: "",
  };
}

function secondary() {
  return {
    enable: false,
    video: defaultVideo("static"),
    sound: sound(),
    options: {
      addTokenWidth: false,
      anchor: "0.5",
      contrast: 0,
      delay: 0,
      elevation: 1000,
      fadeIn: 250,
      fadeOut: 500,
      isMasked: false,
      isRadius: true,
      isWait: false,
      opacity: 1,
      repeat: 1,
      repeatDelay: 250,
      saturate: 0,
      size: 1.5,
      tint: false,
      tintColor: "#FFFFFF",
      zIndex: 1,
    },
  };
}

function source() {
  return {
    enable: false,
    video: defaultVideo("static"),
    sound: sound(),
    options: {
      addTokenWidth: false,
      anchor: "0.5",
      contrast: 0,
      delay: 0,
      elevation: 1000,
      fadeIn: 250,
      fadeOut: 500,
      isMasked: false,
      isRadius: false,
      isWait: true,
      opacity: 1,
      repeat: 1,
      repeatDelay: 250,
      saturate: 0,
      size: 1,
      tint: false,
      tintColor: "#FFFFFF",
      zIndex: 1,
    },
  };
}

function target() {
  return {
    enable: false,
    video: defaultVideo("static"),
    sound: sound(),
    options: {
      addTokenWidth: false,
      anchor: "0.5",
      contrast: 0,
      delay: 0,
      elevation: 1000,
      fadeIn: 250,
      fadeOut: 500,
      isMasked: false,
      isRadius: false,
      opacity: 1,
      persistent: false,
      repeat: 1,
      repeatDelay: 250,
      saturate: 0,
      size: 1,
      tint: false,
      tintColor: "#FFFFFF",
      unbindAlpha: false,
      unbindVisibility: false,
      zIndex: 1,
    },
  };
}

function macro() {
  return { enable: false, name: undefined, args: undefined, playWhen: undefined };
}

function primaryOptions(menu: AutoAnimationsMenu): Record<string, unknown> {
  switch (menu) {
    case "melee":
      return {
        contrast: 0,
        delay: 0,
        elevation: 1000,
        isWait: false,
        opacity: 1,
        playbackRate: 1,
        repeat: 1,
        repeatDelay: 250,
        saturate: 0,
        size: 1,
        tint: false,
        tintColor: "#FFFFFF",
        zIndex: 1,
      };
    case "range":
      return {
        contrast: 0,
        delay: 0,
        elevation: 1000,
        isReturning: false,
        isWait: false,
        onlyX: false,
        opacity: 1,
        playbackRate: 1,
        repeat: 1,
        repeatDelay: 250,
        saturate: 0,
        tint: false,
        tintColor: "#FFFFFF",
        zIndex: 1,
      };
    case "templatefx":
      return {
        contrast: 0,
        delay: 0,
        elevation: 1000,
        isMasked: false,
        isWait: false,
        occlusionAlpha: 0.5,
        occlusionMode: "3",
        opacity: 1,
        persistent: false,
        persistType: "sequencerground",
        playbackRate: 1,
        removeTemplate: false,
        repeat: 1,
        repeatDelay: 250,
        rotate: 0,
        saturate: 0,
        scale: "1",
        tint: false,
        tintColor: "#FFFFFF",
        zIndex: 1,
      };
    case "aura":
      return {
        addTokenWidth: true,
        alpha: false,
        alphaMax: 0.5,
        alphaMin: -0.5,
        alphaDuration: 1000,
        breath: false,
        breathMax: 1.05,
        breathMin: 0.95,
        breathDuration: 1000,
        delay: 0,
        elevation: 1000,
        fadeIn: 250,
        fadeOut: 500,
        isRadius: true,
        isWait: false,
        opacity: 1,
        playbackRate: 1,
        playOn: "source",
        size: 3,
        tint: false,
        tintColor: "#FFFFFF",
        tintSaturate: 0,
        unbindAlpha: false,
        unbindVisibility: false,
        zIndex: 1,
      };
    case "ontoken":
    case "preset":
    default:
      return {
        addTokenWidth: false,
        anchor: "0.5",
        contrast: 0,
        delay: 0,
        elevation: 1000,
        fadeIn: 250,
        fadeOut: 500,
        isMasked: false,
        isRadius: false,
        isWait: false,
        opacity: 1,
        persistent: false,
        playbackRate: 1,
        playOn: "default",
        repeat: 1,
        repeatDelay: 250,
        saturate: 0,
        size: 1,
        tint: false,
        tintColor: "#FFFFFF",
        unbindAlpha: false,
        unbindVisibility: false,
        zIndex: 1,
      };
  }
}

function dbSectionFor(menu: AutoAnimationsMenu, override?: string): string {
  if (override) return override;
  switch (menu) {
    case "melee":
      return "melee";
    case "range":
      return "range";
    case "templatefx":
      return "templatefx";
    default:
      return "static";
  }
}

function randomId(): string {
  const utils = (globalThis as { foundry?: { utils?: { randomID?: () => string } } }).foundry?.utils;
  if (typeof utils?.randomID === "function") return utils.randomID();
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

function toVideo(menu: AutoAnimationsMenu, video: AutoAnimationsVideo): Record<string, unknown> {
  const customPath = video.customPath?.trim() ?? "";
  return {
    dbSection: dbSectionFor(menu, video.dbSection),
    menuType: video.menuType,
    animation: video.animation,
    variant: video.variant,
    color: video.color,
    enableCustom: video.enableCustom ?? Boolean(customPath),
    customPath,
  };
}

export function buildItemAnimationFlags(input: {
  label: string;
  menu: AutoAnimationsMenu;
  isEnabled: boolean;
  primary: AutoAnimationsVideo;
  existing?: Record<string, unknown>;
  merge: boolean;
}): Record<string, unknown> {
  const { menu, primary, isEnabled, label, merge, existing } = input;
  if (merge && existing && existing.menu === menu && existing.isCustomized === true) {
    const next = structuredClone(existing) as Record<string, unknown>;
    const currentPrimary =
      next.primary && typeof next.primary === "object"
        ? (structuredClone(next.primary) as Record<string, unknown>)
        : { options: primaryOptions(menu), sound: sound() };
    currentPrimary.video = toVideo(menu, primary);
    next.primary = currentPrimary;
    next.isEnabled = isEnabled;
    next.isCustomized = true;
    next.label = label;
    next.version = AUTOANIMATIONS_FLAG_VERSION;
    next.menu = menu;
    return next;
  }

  const base: Record<string, unknown> = {
    id: typeof existing?.id === "string" ? existing.id : randomId(),
    label,
    menu,
    isEnabled,
    isCustomized: true,
    fromAmmo: false,
    version: AUTOANIMATIONS_FLAG_VERSION,
    macro: macro(),
    primary: {
      video: toVideo(menu, primary),
      sound: sound(),
      options: primaryOptions(menu),
    },
    secondary: secondary(),
    soundOnly: { sound: sound() },
    source: source(),
    target: target(),
  };

  if (menu === "melee") {
    base.meleeSwitch = {
      video: {
        dbSection: "range",
        menuType: "weapon",
        animation: "arrow",
        variant: "regular",
        color: "regular",
        enableCustom: false,
        customPath: "",
      },
      sound: sound(),
      options: {
        detect: "auto",
        range: 2,
        isReturning: false,
        switchType: "on",
      },
    };
    base.levels3d = { enable: false };
  } else if (menu === "range" || menu === "ontoken") {
    base.levels3d = { enable: false };
  }

  return base;
}

export function readItemAutoAnimationFlags(document: FoundryDocument): Record<string, unknown> | undefined {
  const source = document.toObject(false) as { flags?: Record<string, unknown> };
  const flags = source.flags?.[AUTOANIMATIONS_MODULE_ID];
  if (!flags || typeof flags !== "object" || Array.isArray(flags)) return undefined;
  return flags as Record<string, unknown>;
}
