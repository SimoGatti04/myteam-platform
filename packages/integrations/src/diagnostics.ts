export type DiagnosticSeverity = "info" | "warning" | "error";

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  path?: string;
  value?: string;
}

export function diagnostic(
  code: string,
  severity: DiagnosticSeverity,
  message: string,
  extra: { path?: string; value?: string } = {},
): Diagnostic {
  return {
    code,
    severity,
    message,
    ...(extra.path === undefined ? {} : { path: extra.path }),
    ...(extra.value === undefined ? {} : { value: extra.value }),
  };
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((entry) => entry.severity === "error");
}

/** Deterministic order so diffs and plan digests stay stable. */
export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort((left, right) =>
    [left.code, left.path ?? "", left.message].join("\u0000") <
    [right.code, right.path ?? "", right.message].join("\u0000")
      ? -1
      : 1,
  );
}
