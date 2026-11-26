import { describe, expect, it } from "vitest";

import { render5etoolsBlocks, render5etoolsText } from "../../../apps/mcp-server/src/content/tag-renderer.js";

describe("5etools tag renderer", () => {
  it("renders references, dice, bold and italic deterministically", () => {
    const warnings: string[] = [];
    expect(render5etoolsText("Cast {@spell Absorb Elements|XGE} with {@b force} and {@i care} for {@damage 1d6}.", warnings)).toBe(
      "Cast Absorb Elements with <strong>force</strong> and <em>care</em> for 1d6."
    );
    expect(warnings).toEqual([]);
  });

  it("renders creature attack tags into readable labels", () => {
    expect(render5etoolsText("{@atk mw} {@hit 3} to hit. {@h}{@damage 2d4 + 2} damage and the target is {@condition prone}."))
      .toBe("<em>Melee Weapon Attack:</em> +3 to hit. <em>Hit:</em>2d4 + 2 damage and the target is prone.");
  });

  it("flattens lists and tables into HTML", () => {
    const html = render5etoolsBlocks([
      "Intro",
      { type: "list", items: ["first {@item dagger|phb}", "second"] },
      { type: "table", caption: "Results", colLabels: ["Roll", "Effect"], rows: [["1", "nothing"]] }
    ]);
    expect(html).toContain("<p>Intro</p>");
    expect(html).toContain("<li>first dagger</li>");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Roll</th>");
    expect(html).toContain("<td>nothing</td>");
  });
});
