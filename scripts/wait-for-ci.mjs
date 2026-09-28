// Vercel's `ignoreCommand` (vercel.json): exit 0 skips the build, exit 1 builds it.
// A deploy proceeds only once CI's `verify` job has passed on the exact commit
// Vercel is about to build. Anything else — a failure, a timeout, GitHub being
// unreachable — skips the build, and the previous deployment keeps serving.

import { pathToFileURL } from "node:url";

export const CHECK_NAME = "verify";
const BUILD = 1;
const SKIP = 0;

/**
 * @param {Array<{ id: number, status: string, conclusion: string | null,
 *   app?: { slug?: string }, check_suite?: { id?: number } }>} checkRuns
 * @returns {"pass" | "fail" | "pending"}
 */
export function decide(checkRuns) {
  // A re-run adds a new check run to the same suite; only the newest counts.
  const latestPerSuite = new Map();
  for (const run of checkRuns) {
    if (run.app?.slug !== "github-actions") continue;
    const suite = run.check_suite?.id ?? run.id;
    const seen = latestPerSuite.get(suite);
    if (!seen || run.id > seen.id) latestPerSuite.set(suite, run);
  }
  const runs = [...latestPerSuite.values()];

  if (runs.some((run) => run.status === "completed" && run.conclusion !== "success")) {
    return "fail";
  }
  if (runs.length === 0 || runs.some((run) => run.status !== "completed")) {
    return "pending";
  }
  return "pass";
}

async function main() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  const owner = process.env.VERCEL_GIT_REPO_OWNER;
  const repo = process.env.VERCEL_GIT_REPO_SLUG;
  if (!sha || !owner || !repo) {
    console.log("wait-for-ci: no git commit to check CI against; skipping the build.");
    return SKIP;
  }

  // CI's `verify` has taken about four minutes; this leaves room for a queue.
  const timeoutMs = 15 * 60_000;
  const intervalMs = 20_000;
  const deadline = Date.now() + timeoutMs;
  const url = `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/check-runs?check_name=${CHECK_NAME}&per_page=100`;
  // Unauthenticated on purpose: the repository is public, and a token would be
  // a second credential to provision (readme.test.ts pins the surface).
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };

  console.log(`wait-for-ci: waiting for CI "${CHECK_NAME}" on ${owner}/${repo}@${sha}`);
  for (;;) {
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        console.log(`wait-for-ci: GitHub answered ${response.status}; retrying.`);
      } else {
        const { check_runs: checkRuns } = await response.json();
        const verdict = decide(checkRuns);
        if (verdict === "pass") {
          console.log("wait-for-ci: CI passed; building.");
          return BUILD;
        }
        if (verdict === "fail") {
          console.log("wait-for-ci: CI failed on this commit; skipping the build.");
          return SKIP;
        }
        console.log("wait-for-ci: CI still running.");
      }
    } catch (error) {
      console.log(`wait-for-ci: could not reach GitHub (${error.message}); retrying.`);
    }
    if (Date.now() + intervalMs > deadline) {
      console.log("wait-for-ci: timed out before CI passed; skipping the build.");
      return SKIP;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(await main());
}
