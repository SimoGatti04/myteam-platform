import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHtml, getAttribute, textContent } from "../src/html/dom.js";
import { selectAll, selectOne } from "../src/html/selector.js";
import { tokenize } from "../src/html/tokenizer.js";
import { fixture } from "./helpers.js";

test("tokenizer decodes entities in text and attributes", () => {
  const document = parseHtml('<p title="Caff&egrave;">Caff&egrave; &amp; t&egrave; &#8364;</p>');
  const paragraph = selectOne(document, "p");
  assert.ok(paragraph !== null);
  assert.equal(textContent(paragraph), "Caffè & tè €");
  assert.equal(getAttribute(paragraph, "title"), "Caffè");
});

test("script content is never parsed as markup", () => {
  const tokens = tokenize('<script>var x = "<table class=\\"calendario\\">";</script><p>ok</p>');
  const tags = tokens.filter((token) => token.kind === "startTag").map((token) => (token.kind === "startTag" ? token.name : ""));
  assert.deepEqual(tags, ["script", "p"]);

  const document = parseHtml('<script>var x = "<table class=\\"calendario\\">";</script><table class="calendario"></table>');
  assert.equal(selectAll(document, "table.calendario").length, 1);
});

test("selector engine supports descendants, children, classes, ids and attribute operators", () => {
  const document = parseHtml(`
    <div id="main" class="a b">
      <table class="t"><tbody><tr data-id="P2025X1"><td class="x">1</td><td class="y">Alpha</td></tr></tbody></table>
      <ul><li><a href="/25/team/S1/">S1</a></li></ul>
    </div>`);
  assert.ok(selectOne(document, "div.a.b > table.t") !== null);
  assert.ok(selectOne(document, "div > table") !== null);
  assert.equal(selectAll(document, "[data-id^='P2025']").length, 1);
  assert.equal(selectAll(document, "[data-id$='X1']").length, 1);
  assert.equal(selectAll(document, "[data-id*='2025']").length, 1);
  assert.equal(selectAll(document, "a[href]").length, 1);
  assert.equal(selectOne(document, "#main ul li a") !== null, true);
  assert.equal(selectOne(document, "div.c"), null);
  assert.equal(selectOne(document, "div > ul > a"), null);
});

test("implicit closing of td, tr, li and option", () => {
  const document = parseHtml("<ul><li>a<li>b</ul><table><tr><td>1<td>2<tr><td>3</table>");
  assert.equal(selectAll(document, "ul > li").length, 2);
  assert.equal(selectAll(document, "table > tr").length, 2);
  assert.equal(selectAll(document, "table td").length, 3);
});

test("malformed markup does not throw and keeps readable rows", () => {
  const document = parseHtml(fixture("malformed.html"));
  assert.equal(selectAll(document, "tr.gara").length, 3);
  assert.equal(selectAll(document, "table.calendario").length, 1);
  const firstRow = selectAll(document, "tr.gara")[0];
  assert.ok(firstRow !== undefined);
  assert.equal(getAttribute(firstRow, "data-gara"), "P2025X001");
  assert.equal(textContent(selectOne(document, "h1.competizione") ?? document), "Girone Sintetico & prova");
});

test("unmatched closing tags are ignored", () => {
  const document = parseHtml("<div><p>testo</div></p><span>fine</span>");
  assert.equal(textContent(document), "testo fine");
});
