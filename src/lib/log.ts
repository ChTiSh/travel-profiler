type Level = "info" | "warn" | "error";

/** One JSON object per line on stdout/stderr, easy to grep and to ship to a log pipeline. */
export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}
