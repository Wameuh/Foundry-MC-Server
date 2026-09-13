export type AutoAnimationsMenu =
  | "melee"
  | "range"
  | "ontoken"
  | "templatefx"
  | "aura"
  | "preset";

export type AutoAnimationsCapabilities = {
  active: boolean;
  version?: string;
  compatible: boolean;
  itemRead: boolean;
  itemWrite: boolean;
  autorecRead: boolean;
  catalogSearch: boolean;
  menus: AutoAnimationsMenu[];
  reason?: string;
};

export type AutoAnimationsVideo = {
  dbSection?: string;
  menuType: string;
  animation: string;
  variant: string;
  color: string;
  enableCustom?: boolean;
  customPath?: string;
};

export type AutomatedAnimationsApi = {
  AutorecManager: {
    getAutorecEntries: () => Record<string, unknown>;
  };
  playAnimation: (sourceToken: unknown, item: unknown, options?: Record<string, unknown>) => Promise<unknown>;
};

export type SequencerDatabaseApi = {
  getPathsUnder?: (path: string, softFail?: boolean) => string[] | undefined;
  getEntry?: (path: string, options?: { softFail?: boolean }) => unknown;
};
