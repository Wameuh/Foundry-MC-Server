import { z } from "zod";

/**
 * Control-plane protocol between the Foundry module (browser) and the MCP
 * server, transported over the authenticated bridge websocket after
 * registration. These messages never carry daemon tokens: the server is the
 * only component allowed to talk to the AgentControl daemon, and only for the
 * slots it provisioned for the world.
 */

export const AgentSlotSchema = z.enum(["A", "B"]);
export type AgentSlot = z.infer<typeof AgentSlotSchema>;

export const AgentSlotStateSchema = z.object({
  slot: AgentSlotSchema,
  sessionId: z.string().optional(),
  agent: z.string().optional(),
  model: z.string().optional(),
  mode: z.string().optional(),
  title: z.string().optional(),
  alive: z.boolean(),
  busy: z.boolean(),
  contextUsed: z.number().optional(),
  contextSize: z.number().optional()
}).strict();
export type AgentSlotState = z.infer<typeof AgentSlotStateSchema>;

export const AgentCapabilitiesSchema = z.object({
  id: z.string(),
  name: z.string(),
  available: z.boolean(),
  models: z.array(z.object({ value: z.string(), label: z.string() }).strict()),
  modes: z.array(z.object({ value: z.string(), label: z.string() }).strict())
}).strict();
export type AgentCapabilities = z.infer<typeof AgentCapabilitiesSchema>;

export const AgentEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user_message"), text: z.string(), ts: z.number() }).strict(),
  z.object({ kind: z.literal("agent_message"), text: z.string(), ts: z.number() }).strict(),
  z.object({ kind: z.literal("agent_chunk"), text: z.string(), ts: z.number() }).strict(),
  z.object({
    kind: z.literal("tool_call"),
    name: z.string(),
    status: z.enum(["started", "finished", "failed"]),
    detail: z.string().optional(),
    ts: z.number()
  }).strict(),
  z.object({
    kind: z.literal("permission_request"),
    requestId: z.string(),
    tool: z.string(),
    detail: z.string().optional(),
    options: z.array(z.object({ id: z.string(), label: z.string() }).strict()),
    ts: z.number()
  }).strict(),
  z.object({
    kind: z.literal("question"),
    requestId: z.string(),
    question: z.string(),
    options: z.array(z.object({ id: z.string(), label: z.string() }).strict()).optional(),
    ts: z.number()
  }).strict(),
  z.object({ kind: z.literal("permission_resolved"), requestId: z.string(), ts: z.number() }).strict(),
  z.object({ kind: z.literal("status"), busy: z.boolean(), alive: z.boolean(), ts: z.number() }).strict(),
  z.object({ kind: z.literal("error"), message: z.string(), ts: z.number() }).strict(),
  z.object({ kind: z.literal("cleared"), ts: z.number() }).strict(),
  z.object({ kind: z.literal("compacted"), ts: z.number() }).strict()
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;

/* ---------------- Module → Server ---------------- */

export const AgentControlClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("agentcontrol.getCapabilities") }).strict(),
  z.object({ type: z.literal("agentcontrol.listSlots") }).strict(),
  z.object({
    type: z.literal("agentcontrol.ensureSlot"),
    slot: AgentSlotSchema,
    agent: z.string().optional(),
    model: z.string().optional(),
    mode: z.string().optional()
  }).strict(),
  z.object({ type: z.literal("agentcontrol.destroySlot"), slot: AgentSlotSchema }).strict(),
  z.object({ type: z.literal("agentcontrol.prompt"), slot: AgentSlotSchema, text: z.string().min(1).max(100_000) }).strict(),
  z.object({ type: z.literal("agentcontrol.steer"), slot: AgentSlotSchema, text: z.string().min(1).max(100_000) }).strict(),
  z.object({ type: z.literal("agentcontrol.cancel"), slot: AgentSlotSchema }).strict(),
  z.object({ type: z.literal("agentcontrol.clear"), slot: AgentSlotSchema }).strict(),
  z.object({ type: z.literal("agentcontrol.compact"), slot: AgentSlotSchema }).strict(),
  z.object({
    type: z.literal("agentcontrol.respond"),
    slot: AgentSlotSchema,
    requestId: z.string(),
    optionId: z.string().optional(),
    answer: z.unknown().optional()
  }).strict(),
  z.object({ type: z.literal("agentcontrol.setModel"), slot: AgentSlotSchema, model: z.string() }).strict(),
  z.object({ type: z.literal("agentcontrol.setMode"), slot: AgentSlotSchema, mode: z.string() }).strict(),
  z.object({
    type: z.literal("agentcontrol.setConfig"),
    slot: AgentSlotSchema,
    configId: z.string(),
    value: z.string()
  }).strict(),
  z.object({ type: z.literal("agentcontrol.getState"), slot: AgentSlotSchema }).strict()
]);
export type AgentControlClientMessage = z.infer<typeof AgentControlClientMessageSchema>;

/* ---------------- Server → Module ---------------- */

export const AgentControlServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("agentcontrol.capabilities"),
    agents: z.array(AgentCapabilitiesSchema),
    suggestedAgent: z.string().optional(),
    suggestedModel: z.string().optional(),
    suggestedMode: z.string().optional()
  }).strict(),
  z.object({
    type: z.literal("agentcontrol.slots"),
    slots: z.array(AgentSlotStateSchema)
  }).strict(),
  z.object({
    type: z.literal("agentcontrol.event"),
    slot: AgentSlotSchema,
    event: AgentEventSchema
  }).strict(),
  z.object({
    type: z.literal("agentcontrol.error"),
    slot: AgentSlotSchema.optional(),
    code: z.string(),
    message: z.string(),
    op: z.string().optional()
  }).strict()
]);
export type AgentControlServerMessage = z.infer<typeof AgentControlServerMessageSchema>;

/**
 * Cheap pre-filter before schema validation. On the bridge socket, every
 * message received by the server comes from the module, so the prefix is
 * enough to route control-plane traffic.
 */
export function isAgentControlMessage(value: unknown): boolean {
  return !!value && typeof value === "object" &&
    typeof (value as { type?: unknown }).type === "string" &&
    (value as { type: string }).type.startsWith("agentcontrol.");
}
