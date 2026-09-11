export type FoundryClientState = {
  isGm: boolean;
  moduleActive: boolean;
  userName: string;
};

export interface FoundryBrowserSession {
  openGame(): Promise<"game" | "join">;
  login(username: string, accessKey: string): Promise<void>;
  waitForFoundry(): Promise<FoundryClientState>;
  configureBridge(bridgeUrl: string, bridgeSecret: string): Promise<void>;
  close(): Promise<void>;
}

export type HeadlessBrowserStatus =
  | { state: "disabled" }
  | { state: "starting" | "authenticating" | "waiting_for_bridge" | "connected" | "retrying" | "stopped"; lastError?: string };

export interface HeadlessStatusProvider {
  getStatus(): HeadlessBrowserStatus;
}
