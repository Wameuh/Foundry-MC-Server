import { onInit } from "./lifecycle/init";
import { onReady } from "./lifecycle/ready";
import { onShutdown } from "./lifecycle/shutdown";

Hooks.once("init", onInit);
Hooks.once("ready", () => void onReady());
window.addEventListener("beforeunload", onShutdown, { once: true });
