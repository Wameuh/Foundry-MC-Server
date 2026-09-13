import { AutoAnimationsSearchCatalogInputSchema } from "@foundry-mcp/protocol";
import { refreshAutoAnimationsCapabilities } from "./capability-probe";
import { getSequencerDatabase } from "./detect";
import { AutoAnimationsError, autoanimationsUnavailable } from "./errors";

export function searchAnimationCatalog(payload: unknown) {
  const capabilities = refreshAutoAnimationsCapabilities();
  if (!capabilities.catalogSearch) {
    if (!capabilities.compatible) throw autoanimationsUnavailable(capabilities);
    throw new AutoAnimationsError(
      "AUTOANIMATIONS_API_INCOMPATIBLE",
      "Sequencer.Database.getPathsUnder is unavailable; catalog search requires Sequencer.",
    );
  }

  const parsed = AutoAnimationsSearchCatalogInputSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AutoAnimationsError("INVALID_REQUEST", "Invalid catalog search payload.", {
      issues: parsed.error.issues.map((issue) => issue.message),
    });
  }

  const input = parsed.data;
  const database = getSequencerDatabase();
  if (!database?.getPathsUnder) {
    throw new AutoAnimationsError(
      "AUTOANIMATIONS_API_INCOMPATIBLE",
      "Sequencer.Database.getPathsUnder is unavailable.",
    );
  }

  const rootParts = ["autoanimations"];
  if (input.dbSection) rootParts.push(input.dbSection);
  if (input.menuType) rootParts.push(input.menuType);
  const root = rootParts.join(".");
  const paths = database.getPathsUnder(root, true) ?? [];
  const query = input.query?.trim().toLowerCase();
  const filtered = query
    ? paths.filter((path) => path.toLowerCase().includes(query))
    : paths;

  return {
    root,
    total: filtered.length,
    paths: filtered.slice(0, input.limit),
  };
}
