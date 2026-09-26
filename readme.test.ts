import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Story 1.8's whole deliverable is a path a stranger can walk, so the things
// that would silently rot it are what is pinned here: a step in the README that
// names a script nobody kept, a second environment variable creeping in beside
// `DATABASE_URL`, a value landing in `.env.example`, a `push` finding its way
// into the deploy command (AD-14), or the Node pin drifting between three
// files. None of those break a build; all of them break the five minutes.
//
// The live-deploy claims (AC4's "the same commit is live", AC5's three Neon
// branches) need a Vercel project and are verified by hand against the real
// deployment — see the spec's Implementation Notes. What is mechanically
// checkable here is the *committed* half: that the deploy applies migrations
// and never pushes.

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const readme = read("README.md");
const envExample = read(".env.example");
const gitignore = read(".gitignore");
const nvmrc = read(".nvmrc");
const vercelConfig = JSON.parse(read("vercel.json")) as {
  buildCommand?: string;
};
const packageJson = JSON.parse(read("package.json")) as {
  scripts: Record<string, string>;
  engines: { node: string };
};

// Built from fragments so the pattern itself is not a literal connection
// string — otherwise the repo-wide sweep below would match its own source.
//
// `<` and `>` are excluded from both halves so the sweep can tell a secret
// from a *documented shape*: README.md shows the form as
// `postgresql://<user>:<password>@<host>…`, which a reader needs and which
// carries nothing. Anything with real characters where those placeholders go
// still matches.
const CREDENTIAL_URL = new RegExp(
  "postgres" + "(?:ql)?://" + "[^\\s\"'<>]*:[^\\s\"'<>@]*@",
);

// Lines in `.env.example` that actually assign something, comments stripped.
const envAssignments = envExample
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith("#"));

describe(".env.example — the committed template (AC1, AC6)", () => {
  it("exists, which two error messages have promised since Story 1.4", () => {
    // `src/server/repository/client.ts` and `drizzle.config.ts` both tell the
    // reader to "see .env.example". Until this story it was not in the tree.
    expect(existsSync(path.join(root, ".env.example"))).toBe(true);
    expect(read("src/server/repository/client.ts")).toContain(".env.example");
    expect(read("drizzle.config.ts")).toContain(".env.example");
  });

  it("declares exactly one variable, and it is DATABASE_URL", () => {
    // AC1 is "exactly one environment variable". A second entry here is the
    // cheapest way for that to stop being true without anyone noticing.
    expect(envAssignments).toEqual(["DATABASE_URL="]);
  });

  it("assigns no value, so no secret has a committed default (AC6)", () => {
    expect(envAssignments[0]).toMatch(/^DATABASE_URL=$/);
    expect(envExample).not.toMatch(CREDENTIAL_URL);
  });

  it("is the one .env file git will carry; the real .env is ignored", () => {
    // `--others --exclude-standard` includes files that are untracked but not
    // ignored, so this asserts the same thing before and after the commit that
    // introduces the template — what matters is which `.env*` git can *see*.
    const tracked = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "--", ".env*"],
      { cwd: root, encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .filter(Boolean);

    expect(tracked).toEqual([".env.example"]);
    // The carve-out has to survive in this order: a bare `.env*` with no
    // negation would swallow the template.
    expect(gitignore).toMatch(/^\.env\*$/m);
    expect(gitignore).toMatch(/^!\.env\.example$/m);
    expect(gitignore.indexOf("!.env.example")).toBeGreaterThan(
      gitignore.indexOf(".env*"),
    );
  });
});

describe("no secret is committed anywhere (AC6)", () => {
  it("no file git will carry contains a credential-bearing connection string", () => {
    // `--cached` alone would sweep only what is already committed, which
    // silently exempts every file a story is in the middle of adding — the
    // exact moment a pasted connection string is most likely to be sitting in
    // a draft README. `--others --exclude-standard` adds the untracked files
    // git is not ignoring, so a file is swept from the moment it appears.
    const files = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard"],
      { cwd: root, encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .filter(Boolean);

    const offenders = files.filter((file) => {
      try {
        return CREDENTIAL_URL.test(readFileSync(path.join(root, file), "utf8"));
      } catch {
        // Binary or unreadable: nothing to sweep.
        return false;
      }
    });

    expect(offenders).toEqual([]);
  });

  it("the sweep would actually catch one, and spares the documented shape", () => {
    // Anti-vacuity: a regex that matches nothing passes the case above for the
    // wrong reason. The fixture is concatenated rather than written out so
    // this file does not become its own first offender — which is what an
    // exemption-by-path would otherwise have had to paper over.
    const real =
      "postgresql://" +
      "neondb_owner" +
      ":" +
      "npg_s3cret" +
      "@ep-x.neon.tech/neondb";
    expect(CREDENTIAL_URL.test(real)).toBe(true);

    // What README.md actually prints, and what an empty template holds.
    expect(
      CREDENTIAL_URL.test(
        "postgresql://<user>:<password>@<host>.neon.tech/<database>",
      ),
    ).toBe(false);
    expect(CREDENTIAL_URL.test("DATABASE_URL=")).toBe(false);
  });
});

describe("README.md — the clone-to-running path (AC1, AC2, AC3, AC7)", () => {
  it("names DATABASE_URL as the only variable a developer sets", () => {
    expect(readme).toContain("DATABASE_URL");

    // Any other SCREAMING_SNAKE token shaped like a credential would be a
    // second setup step, which is what AC1 forbids.
    const secretShaped = new Set(
      readme.match(
        /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_(?:URL|KEY|SECRET|TOKEN|PASSWORD)\b/g,
      ) ?? [],
    );
    expect([...secretShaped]).toEqual(["DATABASE_URL"]);
  });

  it("every npm command it documents resolves to something real", () => {
    // The failure this prevents: a script renamed in package.json while the
    // README keeps telling a stranger to run the old name. `npm run ` is
    // optional in the pattern on purpose — `npm test` and `npm start` are
    // shorthands for scripts and rot the same way, and matching only the long
    // form left three of the README's commands unchecked.
    const documented = [
      ...readme.matchAll(/npm (?:run )?([a-z][a-z0-9:-]*)/g),
    ].map((m) => m[1]);
    expect(documented.length).toBeGreaterThan(0);

    // `ci` is npm's own subcommand, not a script in this package.
    const builtIn = new Set(["ci", "install", "i"]);
    const missing = [...new Set(documented)].filter(
      (name) => !builtIn.has(name) && !(name in packageJson.scripts),
    );
    expect(missing).toEqual([]);

    // Anti-vacuity: the shorthands really are in the README, so a future
    // rename of `test` or `start` reaches this assertion.
    expect(documented).toContain("test");
    expect(documented).toContain("ci");
  });

  it("walks the quick start in an order that works (AC1)", () => {
    // `db:migrate` before a `.env` exists fails; `dev` before `npm ci` fails.
    // The order is the whole deliverable, so it is pinned rather than trusted.
    const steps = [
      "npm ci",
      "cp .env.example .env",
      "npm run db:migrate",
      "npm run dev",
    ];
    const positions = steps.map((step) => readme.indexOf(step));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("states the Node version, and it matches .nvmrc and package.json#engines", () => {
    const major = nvmrc.trim();
    expect(major).toBe("24");
    expect(packageJson.engines.node).toContain(major);
    expect(readme).toMatch(new RegExp(`Node(?:\\.js)?[^\\n]*${major}`));
  });

  it("says no Docker and no local database install are needed (AC7)", () => {
    expect(readme).toMatch(/\bno Docker\b/i);
    expect(readme).toMatch(
      /\bno (?:local )?(?:database|Postgres)[^\n]*install|install[^\n]*Postgres/i,
    );
  });

  it("records a measured duration and weighs it against NFR-6 (AC2)", () => {
    // AC2's real content is that the five minutes is *measured*, not asserted,
    // and that the comparison's outcome is written down here rather than
    // discovered in Epic 6.
    expect(readme).toMatch(/\b\d+(?:\.\d+)?\s*(?:seconds?|minutes?|s\b|m\b)/i);
    expect(readme).toMatch(/NFR-6/);
    expect(readme).toMatch(/five minutes|5 minutes/i);
    // A number with no method behind it is the assertion AC2 rejects.
    expect(readme).toMatch(/measured|stopwatch|timed/i);
  });

  it("has a deploy section (AC3) and describes the three environments (AC5)", () => {
    expect(readme).toMatch(/^#+ .*deploy/im);
    for (const environment of ["local", "preview", "production"]) {
      expect(readme.toLowerCase()).toContain(environment);
    }
  });
});

describe("the deploy step applies migrations and never pushes (AC4, AD-14)", () => {
  const buildCommand = vercelConfig.buildCommand ?? "";

  it("runs db:migrate before the build", () => {
    expect(buildCommand).toContain("npm run db:migrate");
    expect(buildCommand).toContain("npm run build");
    expect(buildCommand.indexOf("db:migrate")).toBeLessThan(
      buildCommand.indexOf("run build"),
    );
    // `&&` and not `;` — a failed migration must stop the deploy rather than
    // ship code against an unmigrated database.
    expect(buildCommand).toMatch(/db:migrate\s*&&/);
  });

  it("invokes only scripts that exist", () => {
    const invoked = [
      ...buildCommand.matchAll(/npm run ([a-z][a-z0-9:-]*)/g),
    ].map((m) => m[1]);
    expect(
      invoked.filter((script) => !(script in packageJson.scripts)),
    ).toEqual([]);
  });

  it("reaches no push, directly or through the scripts it chains", () => {
    // AD-14: `drizzle-kit push` is local-only and never targets preview or
    // production. `db:push` is the only script allowed to contain it.
    expect(buildCommand).not.toMatch(/push/);

    const reachable = ["db:migrate", "build", "lint", "typecheck"];
    for (const script of reachable) {
      expect(packageJson.scripts[script]).not.toMatch(/push/);
    }
    expect(packageJson.scripts["db:push"]).toContain("drizzle-kit push");
  });

  it("vercel.json holds no secret", () => {
    expect(read("vercel.json")).not.toMatch(CREDENTIAL_URL);
  });
});

// --- Story 6.3: the secret audit, the runbook and the agent file -------------
//
// The three claims below are the ones Epic 1 made in prose and nothing has
// re-checked since: that `DATABASE_URL` is still the only required variable,
// that no secret has a committed default, and that the deploy is documented
// well enough to operate. Prose rots silently; a scan does not.

/**
 * Every file git will carry with an extension that can read `process.env`.
 *
 * Every JavaScript and TypeScript extension, not only the four this
 * repository happens to use today: a `.cjs` config or a `.jsx` component is
 * one `npm install` away, and a scan that cannot see the file it arrives in
 * is a scan that reports the surface shrinking when it grew.
 */
const trackedSourceFiles = (): string[] =>
  execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter((file) => /\.(m|c)?(ts|js)x?$/.test(file))
    // "Outside tests": a test may legitimately reach for a variable to assert
    // the failure a missing one produces, which is what
    // `client-identity.test.ts` does. This file's own fixtures below are
    // excluded by the same rule, which is why they can be written literally.
    .filter((file) => !/\.test\.[mc]?[tj]sx?$/.test(file))
    // `ls-files` reports index entries, which include a file staged for
    // deletion and gone from the working tree. Reading one throws `ENOENT` at
    // collection time and takes the whole suite down, so it is skipped — the
    // same guard the credential sweep above already applies.
    .filter((file) => existsSync(path.join(root, file)));

const ENV_READ = /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g;

/**
 * Every route to the environment that `ENV_READ` cannot name.
 *
 * Each of these makes the enumeration below pass while the surface grows, so
 * they are reported rather than trusted — the same way `dynamicClassNames`
 * reports a computed `className` instead of quietly contributing nothing.
 */
const OPAQUE_ENV: RegExp[] = [
  // `process.env["NAME"]` — the name is a string, not an identifier.
  /process\.env\s*\[/g,
  // `process.env?.NAME` — `ENV_READ` needs a `.` straight after `env`.
  /process\.env\s*\?\./g,
  // The whole object escaping: `const env = process.env`, `{ ...process.env }`,
  // `configure(process.env)`. Every read of it afterwards is invisible here.
  /process\.env\s*(?=[,)\]};]|$)/gm,
  // The same object under another name: `import { env } from "node:process"`,
  // `require("process")`. No file in this repository does this today.
  /(?:\bfrom\s*|\brequire\s*\(\s*)["'](?:node:)?process["']/g,
];

/** `file: match` for every escape hatch found. */
function opaqueReads(files: { file: string; source: string }[]): string[] {
  return files.flatMap(({ file, source }) =>
    OPAQUE_ENV.flatMap((pattern) =>
      [...source.matchAll(pattern)].map(([hit]) => `${file}: ${hit.trim()}`),
    ),
  );
}

/**
 * A *default* is a fallback whose literal is non-empty.
 *
 * Stated as a rule rather than as an exemption list. `drizzle.config.ts` reads
 * `process.env.DATABASE_URL ?? ""` and the empty string is the absence of a
 * default, not one — it is unreachable on every path that opens a connection,
 * because that file's own guard throws first for `migrate` and `push` and
 * `generate` never connects. Naming it as an exemption would make the next
 * such line exempt by precedent; this way the line passes for a reason a
 * reader can check, and still fails the moment someone writes a real value.
 *
 * The fallback may be a literal *or* an identifier: `?? FALLBACK_URL` hides a
 * committed value one `const` away and would otherwise walk straight past a
 * rule about literals. What this still cannot see is a ternary
 * (`process.env.X === undefined ? "…" : process.env.X`), whose shapes are too
 * many to match without convicting `playwright.config.ts`'s legitimate
 * `process.env.CI ? … : …`. That hole is named rather than papered over.
 */
const ENV_FALLBACK =
  /process\.env\.([A-Za-z_][A-Za-z0-9_]*)\s*(?:\?\?|\|\|)\s*("[^"]*"|'[^']*'|`[^`]*`|[A-Za-z_$][\w$.]*)/g;

/** An empty string fallback is the absence of a default, not one. */
const isEmptyLiteral = (fallback: string): boolean =>
  /^["'`]/.test(fallback) && fallback.slice(1, -1).length === 0;

/** `FILE: expression` for every `process.env` read carrying a real default. */
function envDefaults(files: { file: string; source: string }[]): string[] {
  return files.flatMap(({ file, source }) =>
    [...source.matchAll(ENV_FALLBACK)]
      .filter(([, , fallback]) => !isEmptyLiteral(fallback))
      .map(([hit]) => `${file}: ${hit}`),
  );
}

describe("the environment surface is exactly two names (Story 6.3 AC4)", () => {
  const sources = trackedSourceFiles().map((file) => ({
    file,
    source: read(file),
  }));

  it("reads a real file set, so an empty result would mean a broken scan", () => {
    // Anti-vacuity, in the idiom of
    // `src/client/components/banned-patterns.test.ts:102-116`.
    expect(sources.length).toBeGreaterThan(10);
    expect(sources.map(({ file }) => file)).toContain("drizzle.config.ts");
    expect(sources.map(({ file }) => file)).toContain(
      "src/server/repository/client.ts",
    );
  });

  it("names DATABASE_URL and CI, and nothing else", () => {
    // `CI` is not a secret and is not a setup step: `playwright.config.ts`
    // reads it as a boolean to decide retries, the reporter and whether to
    // reuse a running server. It carries no value anyone has to obtain, and
    // every CI provider sets it. `DATABASE_URL` is the one a developer must
    // supply, which is the claim README.md § Quick start makes.
    const names = new Set(
      sources.flatMap(({ source }) =>
        [...source.matchAll(ENV_READ)].map(([, name]) => name),
      ),
    );
    expect([...names].sort()).toEqual(["CI", "DATABASE_URL"]);
  });

  it("leaves no read out of reach of that enumeration", () => {
    expect(opaqueReads(sources)).toEqual([]);
  });

  it("would report every escape hatch it covers, and spares an ordinary read", () => {
    // Anti-vacuity for the guard above, one fixture per route. Without these
    // the empty result is equally consistent with a pattern that matches
    // nothing — which is what the first version of this guard turned out to
    // be for three of the six forms below.
    const escapes = [
      'const value = process.env["DATABASE_URL"];',
      "const value = process.env?.DATABASE_URL;",
      "const all = process.env;",
      "const copy = { ...process.env };",
      'import { env } from "node:process";',
      'const { env } = require("process");',
    ];
    for (const source of escapes) {
      expect(opaqueReads([{ file: "fixture.ts", source }]), source).not.toEqual(
        [],
      );
    }

    // The named read every real file uses is not an escape hatch, or the
    // assertion above would report the whole repository.
    expect(
      opaqueReads([
        { file: "fixture.ts", source: "const u = process.env.DATABASE_URL;" },
      ]),
    ).toEqual([]);
  });

  it("gives no variable a committed default", () => {
    expect(envDefaults(sources)).toEqual([]);
  });

  it("would report a real default and spares an empty fallback", () => {
    // Anti-vacuity for the rule above, both directions. The first is what a
    // convenience default looks like; the second is `drizzle.config.ts:26`.
    const withDefault = [
      {
        file: "fixture.ts",
        source: 'const url = process.env.DATABASE_URL ?? "postgres://localhost/dev";',
      },
    ];
    expect(envDefaults(withDefault)).toEqual([
      'fixture.ts: process.env.DATABASE_URL ?? "postgres://localhost/dev"',
    ]);

    // An identifier is a default too — the value is one `const` away, and a
    // rule about literals alone would wave it through.
    expect(
      envDefaults([
        { file: "fixture.ts", source: "const url = process.env.DATABASE_URL ?? FALLBACK_URL;" },
      ]),
    ).toEqual(["fixture.ts: process.env.DATABASE_URL ?? FALLBACK_URL"]);

    expect(
      envDefaults([
        { file: "fixture.ts", source: 'url: process.env.DATABASE_URL ?? "",' },
      ]),
    ).toEqual([]);

    // And the real file is the reason the rule is shaped this way.
    expect(read("drizzle.config.ts")).toMatch(/process\.env\.DATABASE_URL \?\? ""/);
  });

  it("declares no env block in next.config.ts", () => {
    // `next.config.ts`'s `env` key inlines values into the bundle at build
    // time (node_modules/next/dist/docs/01-app/02-guides/environment-variables.md),
    // which is the one way a secret reaches the browser without anyone
    // writing `NEXT_PUBLIC_`.
    const nextConfig = read("next.config.ts");
    expect(nextConfig).not.toMatch(/^\s*env\s*:/m);
    expect(nextConfig).not.toMatch(/NEXT_PUBLIC_/);

    // Anti-vacuity: the pattern finds the key when it is there.
    expect("const c = {\n  env: { A: '1' },\n};").toMatch(/^\s*env\s*:/m);
  });
});

describe("no workflow commits a value for a secret (Story 6.3 AC4)", () => {
  // The prefix is optional, so a bare `TOKEN:` or `PASSWORD:` is examined too
  // — requiring an underscore before the suffix would have exempted exactly
  // the shortest and most tempting spellings.
  const SECRET_KEY =
    /^[ \t]*((?:[A-Z][A-Z0-9]*_)*(?:URL|KEY|SECRET|TOKEN|PASSWORD))\s*:\s*(\S.*?)\s*$/gm;
  /**
   * Only a reference into the repository's secret store passes.
   *
   * The quotes are optional because YAML makes them optional: an author who
   * writes `DATABASE_URL: "${{ secrets.DATABASE_URL }}"` is doing the right
   * thing, and an anchored pattern would report it as a committed credential.
   */
  const FROM_SECRETS = /^(["']?)\$\{\{\s*secrets\.[A-Za-z_][A-Za-z0-9_]*\s*\}\}\1$/;

  // `.github` and not `.github/workflows`: a composite action under
  // `.github/actions` can carry an `env:` block of its own and runs with the
  // same permissions.
  const workflows = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", ".github"],
    { cwd: root, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter((file) => /\.ya?ml$/.test(file))
    .map((file) => ({ file, source: read(file) }));

  const assignments = workflows.flatMap(({ file, source }) =>
    [...source.matchAll(SECRET_KEY)].map(([, key, value]) => ({ file, key, value })),
  );

  it("has workflows with a secret-shaped key in them", () => {
    // Anti-vacuity: without this the assertion below passes just as happily
    // on a repository with no `.github/` at all, which is the state Epic 1
    // recorded and Story 6.1 changed.
    expect(workflows.map(({ file }) => file)).toContain(".github/workflows/ci.yml");
    expect(assignments.map(({ key }) => key)).toContain("DATABASE_URL");
  });

  it("assigns every one of them from ${{ secrets.* }}", () => {
    const committed = assignments
      .filter(({ value }) => !FROM_SECRETS.test(value))
      .map(({ file, key, value }) => `${file}: ${key}: ${value}`);
    expect(committed).toEqual([]);
  });

  it("would report a committed one, including under a bare key", () => {
    const fixture =
      "    env:\n" +
      "      DATABASE_URL: postgres://real/value\n" +
      "      TOKEN: hunter2\n";
    const found = [...fixture.matchAll(SECRET_KEY)].map(([, key, value]) => [key, value]);
    expect(found).toEqual([
      ["DATABASE_URL", "postgres://real/value"],
      ["TOKEN", "hunter2"],
    ]);
    for (const [, value] of found) expect(FROM_SECRETS.test(value!)).toBe(false);
  });

  it("passes a secrets reference however it is quoted", () => {
    // All three are the same correct thing in YAML. An anchored pattern would
    // have reported the two quoted forms as committed credentials.
    for (const value of [
      "${{ secrets.DATABASE_URL }}",
      '"${{ secrets.DATABASE_URL }}"',
      "'${{ secrets.DATABASE_URL }}'",
    ]) {
      expect(FROM_SECRETS.test(value), value).toBe(true);
    }
    // A half-quoted value is not a reference, and is not waved through.
    expect(FROM_SECRETS.test('"${{ secrets.DATABASE_URL }}')).toBe(false);
  });
});

describe("the deploy runbook (Story 6.3 AC3)", () => {
  const RUNBOOK = "docs/DEPLOY-RUNBOOK.md";

  it("exists", () => {
    expect(existsSync(path.join(root, RUNBOOK))).toBe(true);
  });

  it("is linked from the README, so it is reachable from the entry point", () => {
    expect(readme).toContain(RUNBOOK);
  });

  it("states how migrations are applied, how the environments differ, and how to roll back", () => {
    // The three things epic-6-context asks a runbook for. Each is checked as
    // a subject the document covers, not as a sentence it contains — the
    // wording is free to improve, the coverage is not free to disappear.
    const runbook = read(RUNBOOK);

    expect(runbook).toMatch(/migrat/i);
    expect(runbook).toContain("db:migrate");
    for (const environment of ["local", "preview", "production"]) {
      expect(runbook.toLowerCase()).toContain(environment);
    }
    expect(runbook).toMatch(/roll(?:ing)?[ -]?back|rollback/i);
  });

  it("does not restate the README, it points at it", () => {
    // Two copies of the boundary rules is the drift this file exists to
    // prevent. The runbook's job is the operational half only.
    const runbook = read(RUNBOOK);
    expect(runbook).toContain("README.md");
    expect(runbook).not.toContain("## Quick start");
  });
});

describe("AGENTS.md carries both halves (Story 6.3 AC6)", () => {
  const BEGIN = "<!-- BEGIN:nextjs-agent-rules -->";
  const END = "<!-- END:nextjs-agent-rules -->";
  const agents = read("AGENTS.md");

  it("keeps Next.js's managed block intact between its markers", () => {
    // `next dev` rewrites only the region between these two markers
    // (node_modules/next/dist/server/lib/generate-agent-files.js,
    // `upsertAgentRulesBlock`). Losing a marker means the next `next dev`
    // appends a second copy of the block.
    expect(agents).toContain(BEGIN);
    expect(agents).toContain(END);
    expect(agents.indexOf(BEGIN)).toBeLessThan(agents.indexOf(END));
    expect(
      agents.slice(agents.indexOf(BEGIN), agents.indexOf(END)),
    ).toContain("This is NOT the Next.js you know");
  });

  it("carries a repository section below the END marker", () => {
    // Below, and not above: content above the BEGIN marker survives too, but
    // a section *between* the markers is one `next dev` away from being
    // overwritten without a diff anyone reads.
    const afterManagedBlock = agents.slice(agents.indexOf(END) + END.length);
    expect(afterManagedBlock.trim().length).toBeGreaterThan(200);
    expect(afterManagedBlock).toContain("README.md");
    expect(afterManagedBlock).toContain("npm run lint");
  });
});
