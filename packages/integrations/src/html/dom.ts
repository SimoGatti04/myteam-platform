import { tokenize, type RawToken } from "./tokenizer.js";

export interface DomText {
  type: "text";
  value: string;
  parent: DomElement | DomDocument | null;
}

export interface DomElement {
  type: "element";
  tag: string;
  attributes: Readonly<Record<string, string>>;
  children: DomNode[];
  parent: DomElement | DomDocument | null;
}

export type DomNode = DomElement | DomText;

export interface DomDocument {
  type: "document";
  children: DomNode[];
}

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/**
 * Tags that implicitly close an open element of the listed tags. This covers
 * the table/list constructs CSI-like pages use; it is not a full HTML5 tree
 * construction algorithm.
 */
const AUTO_CLOSE: Readonly<Record<string, readonly string[]>> = {
  li: ["li"],
  dt: ["dt", "dd"],
  dd: ["dt", "dd"],
  tr: ["tr", "td", "th"],
  td: ["td", "th"],
  th: ["td", "th"],
  option: ["option"],
  optgroup: ["option", "optgroup"],
  p: ["p"],
  thead: ["thead", "tbody", "tfoot", "tr", "td", "th"],
  tbody: ["thead", "tbody", "tfoot", "tr", "td", "th"],
  tfoot: ["thead", "tbody", "tfoot", "tr", "td", "th"],
};

export function parseHtml(html: string): DomDocument {
  const document: DomDocument = { type: "document", children: [] };
  const stack: DomElement[] = [];

  const currentChildren = (): DomNode[] => {
    const top = stack[stack.length - 1];
    return top === undefined ? document.children : top.children;
  };

  const appendNode = (node: DomNode): void => {
    currentChildren().push(node);
  };

  const appendText = (value: string): void => {
    if (value.length === 0) return;
    const siblings = currentChildren();
    const last = siblings[siblings.length - 1];
    if (last !== undefined && last.type === "text") {
      last.value += value;
      return;
    }
    const parent = stack[stack.length - 1] ?? document;
    siblings.push({ type: "text", value, parent });
  };

  const closeOpen = (tag: string): void => {
    const closable = AUTO_CLOSE[tag];
    if (closable === undefined) return;
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top === undefined || !closable.includes(top.tag)) return;
      stack.pop();
    }
  };

  for (const token of tokenize(html)) {
    handleToken(token);
  }

  function handleToken(token: RawToken): void {
    if (token.kind === "text") {
      appendText(token.value);
      return;
    }
    if (token.kind === "comment") return;

    if (token.kind === "startTag") {
      const tag = token.name;
      if (tag === "html" || tag === "head" || tag === "body") {
        // Document wrappers are transparent: their children attach to the
        // current parent so selectors do not need to know the wrapper exists.
        return;
      }
      closeOpen(tag);
      const parent = stack[stack.length - 1] ?? document;
      const element: DomElement = {
        type: "element",
        tag,
        attributes: token.attributes,
        children: [],
        parent,
      };
      appendNode(element);
      if (!VOID_ELEMENTS.has(tag) && !token.selfClosing) stack.push(element);
      return;
    }

    const target = token.name;
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      const candidate = stack[index];
      if (candidate !== undefined && candidate.tag === target) {
        stack.length = index;
        return;
      }
    }
    // Unmatched closing tag: ignore.
  }

  return document;
}

export function elementChildren(node: DomElement | DomDocument): DomElement[] {
  return node.children.filter((child): child is DomElement => child.type === "element");
}

/** Collapsed, trimmed text content. */
export function textContent(node: DomNode | DomDocument): string {
  const parts: string[] = [];
  const walk = (current: DomNode | DomDocument): void => {
    if (current.type === "text") {
      parts.push(current.value);
      return;
    }
    for (const child of current.children) walk(child);
  };
  walk(node);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function getAttribute(node: DomElement, name: string): string | null {
  const value = node.attributes[name.toLowerCase()];
  return value === undefined ? null : value;
}
