import { decodeEntities } from "./entities.js";

export interface StartTagToken {
  kind: "startTag";
  name: string;
  attributes: Record<string, string>;
  selfClosing: boolean;
}

export interface EndTagToken {
  kind: "endTag";
  name: string;
}

export interface TextToken {
  kind: "text";
  value: string;
}

export interface CommentToken {
  kind: "comment";
  value: string;
}

export type RawToken = StartTagToken | EndTagToken | TextToken | CommentToken;

const RAW_TEXT_ELEMENTS = new Set(["script", "style", "textarea", "title"]);

function isNameStart(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z]/.test(char);
}

function isNameChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9:_.-]/.test(char);
}

/**
 * Tolerant HTML tokenizer: never throws on malformed markup, never reorders
 * text, and keeps unknown constructs as text. It is not a full HTML5 parser.
 */
export function tokenize(html: string): RawToken[] {
  const tokens: RawToken[] = [];
  let index = 0;

  const pushText = (value: string): void => {
    if (value.length === 0) return;
    const decoded = decodeEntities(value);
    const last = tokens[tokens.length - 1];
    if (last !== undefined && last.kind === "text") {
      tokens[tokens.length - 1] = { kind: "text", value: last.value + decoded };
      return;
    }
    tokens.push({ kind: "text", value: decoded });
  };

  while (index < html.length) {
    const lt = html.indexOf("<", index);
    if (lt === -1) {
      pushText(html.slice(index));
      break;
    }
    if (lt > index) pushText(html.slice(index, lt));

    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      const stop = end === -1 ? html.length : end;
      tokens.push({ kind: "comment", value: html.slice(lt + 4, stop) });
      index = end === -1 ? html.length : end + 3;
      continue;
    }

    if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) {
      const end = html.indexOf(">", lt + 2);
      index = end === -1 ? html.length : end + 1;
      continue;
    }

    if (html.startsWith("</", lt)) {
      let cursor = lt + 2;
      let name = "";
      while (isNameChar(html[cursor])) {
        name += html[cursor];
        cursor += 1;
      }
      const end = html.indexOf(">", cursor);
      index = end === -1 ? html.length : end + 1;
      if (name.length > 0) tokens.push({ kind: "endTag", name: name.toLowerCase() });
      continue;
    }

    if (!isNameStart(html[lt + 1])) {
      pushText("<");
      index = lt + 1;
      continue;
    }

    let cursor = lt + 1;
    let name = "";
    while (isNameChar(html[cursor])) {
      name += html[cursor];
      cursor += 1;
    }
    const tagName = name.toLowerCase();
    const attributes: Record<string, string> = {};
    let selfClosing = false;

    while (cursor < html.length) {
      while (cursor < html.length && /\s/.test(html[cursor] ?? "")) cursor += 1;
      const char = html[cursor];
      if (char === ">") {
        cursor += 1;
        break;
      }
      if (char === "/" && html[cursor + 1] === ">") {
        selfClosing = true;
        cursor += 2;
        break;
      }
      if (char === "/") {
        cursor += 1;
        continue;
      }
      let attrName = "";
      while (cursor < html.length && !/[\s=/>]/.test(html[cursor] ?? "")) {
        attrName += html[cursor];
        cursor += 1;
      }
      if (attrName.length === 0) {
        cursor += 1;
        continue;
      }
      while (cursor < html.length && /\s/.test(html[cursor] ?? "")) cursor += 1;
      let value = "";
      if (html[cursor] === "=") {
        cursor += 1;
        while (cursor < html.length && /\s/.test(html[cursor] ?? "")) cursor += 1;
        const quote = html[cursor];
        if (quote === '"' || quote === "'") {
          cursor += 1;
          const end = html.indexOf(quote, cursor);
          const stop = end === -1 ? html.length : end;
          value = html.slice(cursor, stop);
          cursor = end === -1 ? html.length : end + 1;
        } else {
          while (cursor < html.length && !/[\s>]/.test(html[cursor] ?? "")) {
            value += html[cursor];
            cursor += 1;
          }
        }
      }
      attributes[attrName.toLowerCase()] = decodeEntities(value);
    }

    tokens.push({ kind: "startTag", name: tagName, attributes, selfClosing });

    if (RAW_TEXT_ELEMENTS.has(tagName) && !selfClosing) {
      const closePattern = new RegExp(`</${tagName}\\s*>`, "i");
      const rest = html.slice(cursor);
      const match = closePattern.exec(rest);
      if (match === null) {
        pushText(rest);
        index = html.length;
      } else {
        pushText(rest.slice(0, match.index));
        index = cursor + match.index + match[0].length;
      }
      continue;
    }

    index = cursor;
  }

  return tokens;
}
