export const APPLICATION_VERSION = "0.2.4" as const;
export const PROTOCOL_VERSION = "1.0.0" as const;
export const DEFAULT_OPERATION_TIMEOUT_MS = 30_000;
export const PLUTONIUM_OPERATION_TIMEOUT_MS = 120_000;
export const BRIDGE_HEARTBEAT_INTERVAL_MS = 20_000;
export const BRIDGE_STALE_AFTER_MS = 60_000;
export const IDEMPOTENCY_TTL_MS = 15 * 60_000;
export const DELETION_CONFIRMATION_TTL_MS = 2 * 60_000;

export const MAX_DOCUMENT_BATCH_SIZE = 50;
export const MAX_SEARCH_LIMIT = 100;
export const MAX_PLUTONIUM_ENTRY_BATCH_SIZE = 20;
export const MAX_PLUTONIUM_PAYLOAD_BYTES = 2 * 1024 * 1024;

export const SUPPORTED_FOUNDRY_VERSION = "14.367" as const;
export const SUPPORTED_DND5E_VERSION = "5.3.3" as const;
export const SUPPORTED_PLUTONIUM_VERSIONS = ["2.18.1.v14", "2.18.3.v14"] as const;
/** @deprecated Use SUPPORTED_PLUTONIUM_VERSIONS for compatibility checks. */
export const SUPPORTED_PLUTONIUM_VERSION = SUPPORTED_PLUTONIUM_VERSIONS[0];
