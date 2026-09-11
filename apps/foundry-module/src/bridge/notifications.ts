import { readSettings } from "../settings/read-settings";

export function notifyResult(operation: string, result: unknown): void {
  if (!readSettings().notifications || !isMutation(operation)) return;
  const status = (result as { status?: unknown } | undefined)?.status;
  if (status === "partial") ui.notifications?.warn(`Foundry MCP: ${operation} completed partially.`);
  else ui.notifications?.info(`Foundry MCP: ${operation} completed.`);
}

export function notifyError(operation: string): void {
  if (readSettings().notifications && isMutation(operation)) ui.notifications?.error(`Foundry MCP: ${operation} failed.`);
}

function isMutation(operation: string): boolean {
  return /(create|update|import|delete|build)/i.test(operation);
}
