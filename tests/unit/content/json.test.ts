import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("content JSON helpers", () => {
  it("slugifies without relying on ICU normalization, which is optional in the embedded runtime", () => {
    const env = { ...process.env };
    delete env["NODE_ICU_DATA"];
    const result = spawnSync(process.execPath, [
      resolve("node_modules/tsx/dist/cli.mjs"),
      "-e",
      'import { slugify } from "./apps/mcp-server/src/content/json.ts"; console.log(slugify("Coup de grâce"))'
    ], { cwd: resolve("."), env, encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("coup-de-grace");
  });
});
