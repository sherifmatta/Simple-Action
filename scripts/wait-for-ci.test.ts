import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHECK_NAME, decide } from "./wait-for-ci.mjs";

const run = (id: number, suite: number, status: string, conclusion: string | null) => ({
  id,
  status,
  conclusion,
  app: { slug: "github-actions" },
  check_suite: { id: suite },
});

describe("wait-for-ci — the deploy gate's verdict", () => {
  it("is pending before CI has reported anything", () => {
    expect(decide([])).toBe("pending");
  });

  it("is pending while a run is in progress", () => {
    expect(decide([run(1, 10, "in_progress", null)])).toBe("pending");
  });

  it("passes only when every suite's latest run succeeded", () => {
    expect(decide([run(1, 10, "completed", "success"), run(2, 20, "completed", "success")])).toBe(
      "pass",
    );
    expect(decide([run(1, 10, "completed", "success"), run(2, 20, "queued", null)])).toBe(
      "pending",
    );
  });

  it("fails on any conclusion other than success", () => {
    for (const conclusion of ["failure", "cancelled", "timed_out", "skipped", "action_required"]) {
      expect(decide([run(1, 10, "completed", conclusion)])).toBe("fail");
    }
  });

  it("judges a re-run by its newest attempt, not the earlier failure", () => {
    expect(decide([run(1, 10, "completed", "failure"), run(2, 10, "completed", "success")])).toBe(
      "pass",
    );
    expect(decide([run(1, 10, "completed", "failure"), run(2, 10, "in_progress", null)])).toBe(
      "pending",
    );
  });

  it("ignores check runs from apps other than GitHub Actions", () => {
    const foreign = { ...run(1, 10, "completed", "success"), app: { slug: "vercel" } };
    expect(decide([foreign])).toBe("pending");
  });
});

describe("wait-for-ci — wiring", () => {
  it("is vercel.json's ignoreCommand", () => {
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(vercel.ignoreCommand).toBe("node scripts/wait-for-ci.mjs");
  });

  it("waits on the job ci.yml actually defines", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(workflow).toMatch(new RegExp(`^  ${CHECK_NAME}:$`, "m"));
  });
});
