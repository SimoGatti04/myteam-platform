import { elementChildren, type DomDocument, type DomElement } from "./dom.js";

type AttributeOperator = "exists" | "=" | "^=" | "$=" | "*=";

interface AttributeTest {
  name: string;
  operator: AttributeOperator;
  value: string;
}

interface CompoundSelector {
  tag: string | null;
  id: string | null;
  classes: string[];
  attributes: AttributeTest[];
}

interface SelectorPart {
  compound: CompoundSelector;
  /** Relation to the previous part: null for the first part. */
  combinator: " " | ">" | null;
}

const SELECTOR_CACHE = new Map<string, SelectorPart[][]>();

function parseAttribute(text: string): AttributeTest {
  const match = /^\[([A-Za-z0-9_:.-]+)\s*(?:(\^=|\$=|\*=|=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]*)))?\]$/.exec(text);
  if (match === null) {
    throw new Error(`Unsupported attribute selector: ${text}`);
  }
  const name = (match[1] ?? "").toLowerCase();
  const operator = match[2] as AttributeOperator | undefined;
  if (operator === undefined) return { name, operator: "exists", value: "" };
  const value = match[3] ?? match[4] ?? match[5] ?? "";
  return { name, operator, value };
}

function parseCompound(text: string): CompoundSelector {
  const compound: CompoundSelector = { tag: null, id: null, classes: [], attributes: [] };
  let index = 0;

  if (text[0] === "*") {
    index = 1;
  } else if (/[A-Za-z]/.test(text[0] ?? "")) {
    let tag = "";
    while (index < text.length && /[A-Za-z0-9-]/.test(text[index] ?? "")) {
      tag += text[index];
      index += 1;
    }
    compound.tag = tag.toLowerCase();
  }

  while (index < text.length) {
    const char = text[index];
    if (char === ".") {
      index += 1;
      let name = "";
      while (index < text.length && /[A-Za-z0-9_-]/.test(text[index] ?? "")) {
        name += text[index];
        index += 1;
      }
      if (name.length === 0) throw new Error(`Invalid class selector: ${text}`);
      compound.classes.push(name);
      continue;
    }
    if (char === "#") {
      index += 1;
      let name = "";
      while (index < text.length && /[A-Za-z0-9_-]/.test(text[index] ?? "")) {
        name += text[index];
        index += 1;
      }
      if (name.length === 0) throw new Error(`Invalid id selector: ${text}`);
      compound.id = name;
      continue;
    }
    if (char === "[") {
      let end = index + 1;
      let quoted: string | null = null;
      while (end < text.length) {
        const current = text[end];
        if (quoted !== null) {
          if (current === quoted) quoted = null;
        } else if (current === '"' || current === "'") {
          quoted = current;
        } else if (current === "]") {
          break;
        }
        end += 1;
      }
      if (end >= text.length) throw new Error(`Unterminated attribute selector: ${text}`);
      compound.attributes.push(parseAttribute(text.slice(index, end + 1)));
      index = end + 1;
      continue;
    }
    throw new Error(`Unsupported selector syntax near "${text.slice(index)}"`);
  }

  if (compound.tag === null && compound.id === null && compound.classes.length === 0 && compound.attributes.length === 0) {
    throw new Error(`Empty selector: ${text}`);
  }
  return compound;
}

function splitGroups(selector: string): string[] {
  const groups: string[] = [];
  let current = "";
  let quoted: string | null = null;
  let depth = 0;
  for (const char of selector) {
    if (quoted !== null) {
      current += char;
      if (char === quoted) quoted = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quoted = char;
      current += char;
      continue;
    }
    if (char === "[") depth += 1;
    if (char === "]") depth -= 1;
    if (char === "," && depth === 0) {
      groups.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  groups.push(current);
  return groups.map((group) => group.trim()).filter((group) => group.length > 0);
}

function parseGroup(group: string): SelectorPart[] {
  const parts: SelectorPart[] = [];
  let index = 0;
  let pendingCombinator: " " | ">" | null = null;

  while (index < group.length) {
    let sawWhitespace = false;
    while (index < group.length && /\s/.test(group[index] ?? "")) {
      index += 1;
      sawWhitespace = true;
    }
    if (index >= group.length) break;
    if (group[index] === ">") {
      if (parts.length === 0) throw new Error(`Selector cannot start with ">": ${group}`);
      pendingCombinator = ">";
      index += 1;
      continue;
    }
    if (parts.length > 0 && pendingCombinator === null) {
      if (!sawWhitespace) throw new Error(`Missing combinator in selector: ${group}`);
      pendingCombinator = " ";
    }
    let end = index;
    let quoted: string | null = null;
    let depth = 0;
    while (end < group.length) {
      const char = group[end];
      if (quoted !== null) {
        if (char === quoted) quoted = null;
      } else if (char === '"' || char === "'") {
        quoted = char;
      } else if (char === "[") {
        depth += 1;
      } else if (char === "]") {
        depth -= 1;
      } else if (depth === 0 && (/\s/.test(char ?? "") || char === ">")) {
        break;
      }
      end += 1;
    }
    const compound = parseCompound(group.slice(index, end));
    parts.push({ compound, combinator: parts.length === 0 ? null : pendingCombinator ?? " " });
    pendingCombinator = null;
    index = end;
  }

  if (parts.length === 0) throw new Error(`Empty selector: ${group}`);
  return parts;
}

function parseSelector(selector: string): SelectorPart[][] {
  const cached = SELECTOR_CACHE.get(selector);
  if (cached !== undefined) return cached;
  const parsed = splitGroups(selector).map(parseGroup);
  if (parsed.length === 0) throw new Error(`Empty selector: ${selector}`);
  SELECTOR_CACHE.set(selector, parsed);
  return parsed;
}

function matchesAttribute(element: DomElement, test: AttributeTest): boolean {
  const actual = element.attributes[test.name];
  if (test.operator === "exists") return actual !== undefined;
  if (actual === undefined) return false;
  switch (test.operator) {
    case "=":
      return actual === test.value;
    case "^=":
      return actual.startsWith(test.value);
    case "$=":
      return actual.endsWith(test.value);
    case "*=":
      return actual.includes(test.value);
    default:
      return false;
  }
}

function matchesCompound(element: DomElement, compound: CompoundSelector): boolean {
  if (compound.tag !== null && element.tag !== compound.tag) return false;
  if (compound.id !== null && element.attributes["id"] !== compound.id) return false;
  if (compound.classes.length > 0) {
    const classes = (element.attributes["class"] ?? "").split(/\s+/);
    for (const name of compound.classes) {
      if (!classes.includes(name)) return false;
    }
  }
  for (const test of compound.attributes) {
    if (!matchesAttribute(element, test)) return false;
  }
  return true;
}

function matchesPart(element: DomElement, parts: readonly SelectorPart[], index: number): boolean {
  const part = parts[index];
  if (part === undefined) return false;
  if (!matchesCompound(element, part.compound)) return false;
  if (index === 0) return true;

  if (part.combinator === ">") {
    const parent = element.parent;
    return parent !== null && parent.type === "element" && matchesPart(parent, parts, index - 1);
  }

  let ancestor = element.parent;
  while (ancestor !== null && ancestor.type === "element") {
    if (matchesPart(ancestor, parts, index - 1)) return true;
    ancestor = ancestor.parent;
  }
  return false;
}

function collectElements(root: DomElement | DomDocument): DomElement[] {
  const result: DomElement[] = [];
  const walk = (node: DomElement | DomDocument): void => {
    for (const child of node.children) {
      if (child.type !== "element") continue;
      result.push(child);
      walk(child);
    }
  };
  walk(root);
  return result;
}

export function selectAll(root: DomElement | DomDocument, selector: string): DomElement[] {
  const groups = parseSelector(selector);
  const candidates = collectElements(root);
  return candidates.filter((element) => groups.some((parts) => matchesPart(element, parts, parts.length - 1)));
}

export function selectOne(root: DomElement | DomDocument, selector: string): DomElement | null {
  return selectAll(root, selector)[0] ?? null;
}

export function directChildren(element: DomElement): DomElement[] {
  return elementChildren(element);
}
