import { asArray, asRecord, text } from "./json.js";

const MAX_RENDERED_DESCRIPTION_BYTES = 64 * 1024;

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function referenceText(body: string): string {
  const parts = body.split("|").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) return parts.slice(2).join("|");
  return parts[0] ?? body;
}

function firstPart(body: string): string {
  return (body.split("|")[0] ?? body).trim();
}

function renderTag(tag: string, body: string, warnings?: string[]): string {
  const normalized = tag.toLocaleLowerCase();
  switch (normalized) {
    case "b":
    case "bold":
      return `<strong>${render5etoolsText(body, warnings)}</strong>`;
    case "i":
    case "italic":
      return `<em>${render5etoolsText(body, warnings)}</em>`;
    case "damage":
    case "dice":
      return escapeHtml(firstPart(body));
    case "scaledamage":
    case "scaledice":
      return escapeHtml(firstPart(body));
    case "hit": {
      const value = firstPart(body);
      return escapeHtml(value.startsWith("+") || value.startsWith("-") ? value : `+${value}`);
    }
    case "dc":
      return escapeHtml(`DC ${firstPart(body)}`);
    case "atk": {
      const kind = firstPart(body).toLocaleLowerCase();
      const label = kind === "mw" ? "Melee Weapon Attack:"
        : kind === "rw" ? "Ranged Weapon Attack:"
          : kind === "ms" ? "Melee Spell Attack:"
            : kind === "rs" ? "Ranged Spell Attack:"
              : "Attack:";
      return `<em>${label}</em>`;
    }
    case "h":
      return "<em>Hit:</em>";
    case "chance":
      return escapeHtml(`${firstPart(body)}%`);
    case "spell":
    case "item":
    case "creature":
    case "skill":
    case "condition":
    case "action":
    case "status":
    case "sense":
    case "race":
    case "class":
    case "subclass":
    case "background":
    case "feat":
    case "reward":
    case "optionalfeature":
    case "deity":
    case "trap":
    case "hazard":
    case "object":
    case "cult":
    case "boon":
    case "table":
    case "variantrule":
    case "vehicle":
    case "vehupgrade":
    case "book":
    case "adventure":
    case "filter":
    case "note":
    case "quickref":
    case "area":
    case "homebrew":
      return escapeHtml(referenceText(body));
    default:
      if (warnings && !warnings.some((warning) => warning.includes(`{@${normalized}`))) {
        warnings.push(`Renderer approximation: unsupported tag {@${normalized}} was flattened to plain text`);
      }
      return escapeHtml(referenceText(body));
  }
}

export function render5etoolsText(input: string, warnings?: string[]): string {
  let output = "";
  let cursor = 0;
  const preprocessed = input.replaceAll("{@h}", "{@h }");
  while (cursor < preprocessed.length) {
    const start = preprocessed.indexOf("{@", cursor);
    if (start === -1) {
      output += escapeHtml(preprocessed.slice(cursor));
      break;
    }
    output += escapeHtml(preprocessed.slice(cursor, start));
    let depth = 0;
    let end = -1;
    for (let index = start; index < preprocessed.length; index += 1) {
      const char = preprocessed[index];
      if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          end = index;
          break;
        }
      }
    }
    if (end === -1) {
      output += escapeHtml(preprocessed.slice(start));
      break;
    }
    const inner = preprocessed.slice(start + 2, end);
    const firstWhitespace = inner.search(/\s/);
    const tag = firstWhitespace === -1 ? inner : inner.slice(0, firstWhitespace);
    const body = firstWhitespace === -1 ? "" : inner.slice(firstWhitespace).trim();
    output += renderTag(tag, body, warnings);
    cursor = end + 1;
  }
  return output;
}

function inlineEntry(value: unknown, warnings?: string[]): string {
  if (typeof value === "string") return render5etoolsText(value, warnings);
  if (typeof value === "number" || typeof value === "boolean") return escapeHtml(value);
  const record = asRecord(value);
  if (!record) return "";
  if (Array.isArray(record["entries"])) return render5etoolsBlocks(record["entries"], warnings).replaceAll(/<\/?p>/g, " ");
  if (typeof record["entry"] === "string") return render5etoolsText(record["entry"], warnings);
  if (typeof record["name"] === "string") return escapeHtml(record["name"]);
  return escapeHtml(text(record["text"]));
}

function renderTable(record: Record<string, unknown>, warnings?: string[]): string {
  const caption = typeof record["caption"] === "string" ? `<caption>${render5etoolsText(record["caption"], warnings)}</caption>` : "";
  const labels = asArray(record["colLabels"]).map((label) => `<th>${inlineEntry(label, warnings)}</th>`).join("");
  const rows = asArray(record["rows"]).map((row) => {
    const cells = Array.isArray(row) ? row : [row];
    return `<tr>${cells.map((cell) => `<td>${inlineEntry(cell, warnings)}</td>`).join("")}</tr>`;
  }).join("");
  return `<table>${caption}${labels ? `<thead><tr>${labels}</tr></thead>` : ""}<tbody>${rows}</tbody></table>`;
}

function renderObjectEntry(record: Record<string, unknown>, warnings?: string[]): string {
  const type = text(record["type"], "entries");
  if (type === "table") return renderTable(record, warnings);
  if (type === "list") {
    const items = asArray(record["items"]).map((item) => `<li>${inlineEntry(item, warnings)}</li>`).join("");
    return `<ul>${items}</ul>`;
  }
  if (type === "inset" || type === "quote" || type === "insetReadaloud") {
    return `<blockquote>${render5etoolsBlocks(asArray(record["entries"]), warnings)}</blockquote>`;
  }
  if (type === "image" || type === "gallery" || type === "link") {
    if (warnings) warnings.push(`Renderer approximation: dropped non-text entry type ${type}`);
    return "";
  }
  const title = typeof record["name"] === "string" && record["name"]
    ? `<p><strong>${render5etoolsText(record["name"], warnings)}</strong></p>`
    : "";
  const entries = asArray(record["entries"]);
  if (entries.length) return `${title}${render5etoolsBlocks(entries, warnings)}`;
  if (typeof record["entry"] === "string") return `${title}<p>${render5etoolsText(record["entry"], warnings)}</p>`;
  return title;
}

export function render5etoolsBlocks(entries: unknown, warnings?: string[]): string {
  const parts = (Array.isArray(entries) ? entries : [entries]).flatMap((entry) => {
    if (typeof entry === "string") return entry.trim() ? [`<p>${render5etoolsText(entry, warnings)}</p>`] : [];
    const rendered = renderObjectEntry(asRecord(entry) ?? {}, warnings);
    return rendered ? [rendered] : [];
  });
  const html = parts.join("\n");
  if (Buffer.byteLength(html, "utf8") <= MAX_RENDERED_DESCRIPTION_BYTES) return html;
  if (warnings) warnings.push("Renderer warning: description exceeded 64 KiB and was truncated");
  return html.slice(0, MAX_RENDERED_DESCRIPTION_BYTES);
}
