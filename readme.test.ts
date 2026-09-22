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
