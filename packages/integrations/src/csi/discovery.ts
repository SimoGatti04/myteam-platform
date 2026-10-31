import { diagnostic, type Diagnostic } from "../diagnostics.js";
import { getAttribute, parseHtml, textContent } from "../html/dom.js";
import { selectAll } from "../html/selector.js";
import type { CsiExtractionProfile } from "./profile.js";

export interface DiscoveryOption {
  label: string;
  /** Source value (season segment, committee code, …) when published. */
  value: string | null;
  /** Absolute link when the option is a link. */
  href: string | null;
}

export interface DiscoveryResult {
  options: DiscoveryOption[];
  diagnostics: Diagnostic[];
}

/**
 * Best-effort discovery of selectable options (seasons, committees, groups)
 * from a public index page. Options are *candidates*: the administrator picks,
 * nothing is auto-selected.
 */
export function parseDiscoveryOptions(
  html: string,
  options: { profile: CsiExtractionProfile; baseUrl: string },
): DiscoveryResult {
  const document = parseHtml(html);
  const diagnostics: Diagnostic[] = [];
  const items = selectAll(document, options.profile.discovery.itemSelector);

  if (items.length === 0) {
    diagnostics.push(
      diagnostic("discovery_no_options", "warning", "No selectable options matched the extraction profile"),
    );
    return { options: [], diagnostics };
  }

  const seen = new Set<string>();
  const result: DiscoveryOption[] = [];
  items.forEach((item, index) => {
    const label = textContent(item);
    if (label.length === 0) {
      diagnostics.push(diagnostic("discovery_empty_label", "warning", "Option without a label was skipped", { path: `options[${index}]` }));
      return;
    }
    const rawValue = getAttribute(item, options.profile.discovery.valueAttribute);
    const rawHref = getAttribute(item, options.profile.discovery.hrefAttribute);
    let href: string | null = null;
    if (rawHref !== null && rawHref.trim().length > 0) {
      try {
        const resolved = new URL(rawHref.trim(), options.baseUrl);
        href = resolved.protocol === "https:" ? resolved.toString() : null;
        if (href === null) {
          diagnostics.push(diagnostic("discovery_unsafe_link", "warning", "Non-HTTPS option link ignored", { path: `options[${index}]`, value: rawHref }));
        }
      } catch {
        diagnostics.push(diagnostic("discovery_invalid_link", "warning", "Unparsable option link ignored", { path: `options[${index}]`, value: rawHref }));
      }
    }
    const key = `${label}\u0000${rawValue ?? ""}\u0000${href ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ label, value: rawValue !== null && rawValue.trim().length > 0 ? rawValue.trim() : null, href });
  });

  return { options: result, diagnostics };
}
