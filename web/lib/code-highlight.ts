/** Lightweight syntax highlighting for Lean, Li, and TOML drilldown snippets. */

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function span(cls: string, text: string): string {
  return `<span class="tok-${cls}">${esc(text)}</span>`;
}

const TOML_KEY = /^(\s*)([A-Za-z0-9_.-]+)(\s*=)/;

export function highlightLine(language: string, line: string): string {
  const lang = language.toLowerCase();

  if (lang === "toml") {
    if (/^\s*#/.test(line)) return span("comment", line);
    const keyMatch = line.match(TOML_KEY);
    if (keyMatch) {
      const [, indent, key, eq] = keyMatch;
      const rest = line.slice(keyMatch[0].length);
      return (
        esc(indent ?? "") +
        span("key", key ?? "") +
        esc(eq ?? "") +
        highlightStrings(rest)
      );
    }
    if (/^\s*\[\[/.test(line)) return span("section", line);
    return highlightStrings(line);
  }

  if (lang === "lean") {
    return highlightLean(line);
  }

  if (lang === "li") {
    return highlightLi(line);
  }

  return esc(line);
}

function highlightLean(line: string): string {
  const parts: Array<{ start: number; end: number; cls: string }> = [];
  const rules: Array<[RegExp, string]> = [
    [/\b(axiom|theorem|lemma|def|namespace|import|end|open|variable|structure|class|instance|where|by|have|let|in|if|then|else|Prop|Type|Sort|True|False|sorry)\b/g, "keyword"],
    [/\b(Nat|Int|Bool|Real|String)\b/g, "type"],
    [/[∀∃→↔≤≥≠∧∨]/g, "operator"],
    [/"([^"\\]|\\.)*"/g, "string"],
  ];
  for (const [re, cls] of rules) {
    const regex = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = regex.exec(line)) !== null) {
      parts.push({ start: m.index, end: m.index + m[0].length, cls });
    }
  }
  return applyParts(line, parts);
}

function highlightLi(line: string): string {
  const parts: Array<{ start: number; end: number; cls: string }> = [];
  const rules: Array<[RegExp, string]> = [
    [/\b(extern|proc|def|requires|ensures|decreases|return|true|int|bool|void)\b/g, "keyword"],
    [/"([^"\\]|\\.)*"/g, "string"],
    [/\b\d+\b/g, "number"],
  ];
  for (const [re, cls] of rules) {
    const regex = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = regex.exec(line)) !== null) {
      parts.push({ start: m.index, end: m.index + m[0].length, cls });
    }
  }
  return applyParts(line, parts);
}

function applyParts(
  line: string,
  parts: Array<{ start: number; end: number; cls: string }>,
): string {
  parts.sort((a, b) => a.start - b.start || b.end - a.end);
  let out = "";
  let cursor = 0;
  for (const part of parts) {
    if (part.start < cursor) continue;
    out += esc(line.slice(cursor, part.start));
    out += span(part.cls, line.slice(part.start, part.end));
    cursor = part.end;
  }
  out += esc(line.slice(cursor));
  return out || esc(line);
}

function highlightStrings(text: string): string {
  return text.replace(/"([^"\\]|\\.)*"/g, (s) => span("string", s));
}
