/** Client-side error boundary hook (no third-party telemetry). */
export function reportClientError(
  error: unknown,
  context: Record<string, unknown> = {},
): void {
  if (typeof console !== "undefined") {
    console.error("[PROJECT LAB]", context, error);
  }
}
