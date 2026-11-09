import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// .env.example is committed (whitelisted in .gitignore). A real key pasted into it
// was committed once; this keeps it from happening again.
describe(".env.example", () => {
  it("never contains a value for LLM_API_KEY", () => {
    const text = readFileSync(join(process.cwd(), ".env.example"), "utf8");
    const line = text.split("\n").find((l) => l.startsWith("LLM_API_KEY="));
    expect(line).toBe("LLM_API_KEY=");
  });
});
