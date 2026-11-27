import { z } from "zod";

// Forward-compatible: newer control clients may announce capabilities unknown
// to an older server.
export const BridgeCapabilitySchema = z.string().trim().min(1).max(255);
export type BridgeCapabilityValue = z.infer<typeof BridgeCapabilitySchema>;
