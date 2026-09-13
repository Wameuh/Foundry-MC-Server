import { readFileSync } from "node:fs";

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const AGENT_RULES_URI = "foundry://agent-rules";
const MAX_AGENT_RULES_BYTES = 128 * 1024;
const AGENT_RULES_PATH = new URL("../../../../agent_rules.md", import.meta.url);

export function loadAgentRules(): string {
  let rules: string;
  try {
    rules = readFileSync(AGENT_RULES_PATH, "utf8").trim();
  } catch (error) {
    throw new Error("Unable to read agent_rules.md.", { cause: error });
  }
  if (!rules) throw new Error("agent_rules.md must not be empty.");
  if (Buffer.byteLength(rules, "utf8") > MAX_AGENT_RULES_BYTES) {
    throw new Error(`agent_rules.md exceeds the ${MAX_AGENT_RULES_BYTES}-byte limit.`);
  }
  return rules;
}

export function buildServerInstructions(rules: string): string {
  return [
    "The following Foundry operating rules are supplied by the server administrator.",
    "Apply them whenever you use this MCP server. Re-read foundry://agent-rules or call foundry_get_agent_rules if the administrator may have updated them during this session.",
    "Use foundry_get_context before acting on phrases such as 'this sheet' or 'the selected token'.",
    "Use foundry_get_schema before changing unfamiliar document fields.",
    "Never claim a deletion is complete until foundry_prepare_delete and foundry_confirm_delete have both succeeded.",
    "Use Plutonium tools only after checking plutonium_get_capabilities.",
    "Use Automated Animations tools only after checking autoanimations_get_capabilities.",
    "",
    rules,
  ].join("\n");
}

export function registerAgentRules(server: McpServer): void {
  server.registerResource(
    "foundry-agent-rules",
    AGENT_RULES_URI,
    {
      title: "Foundry agent rules",
      description: "Administrator-maintained rules and lessons for safely operating Foundry through this MCP server.",
      mimeType: "text/markdown",
    },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: loadAgentRules() }],
    }),
  );

  server.registerTool(
    "foundry_get_agent_rules",
    {
      description: "Read the current administrator-maintained Foundry operating rules. Call this when rules may have changed since the MCP connection was opened.",
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    () => {
      const rules = loadAgentRules();
      return {
        content: [{ type: "text" as const, text: rules }],
        structuredContent: { uri: AGENT_RULES_URI, rules },
      };
    },
  );
}
