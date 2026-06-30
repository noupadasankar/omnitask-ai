#!/usr/bin/env node
// OmniTask — one-command local dev launcher (cross-platform).
// Starts infra (Postgres + Redis), then runs backend + frontend + worker (turbo)
// and the Python browser engine together. Ctrl-C stops everything.
//
// Usage:  pnpm stack        (from repo root)
//    or:  node scripts/dev.mjs
//
// Why Node instead of bash: on Windows, `bash` on PATH often resolves to the
// WSL relay (C:\Windows\System32\bash.exe). With no WSL distro installed that
// fails with `execvpe(/bin/bash) failed`. Node runs the same everywhere.

import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";

// On Windows, .cmd/.bat shims (pnpm, docker, npm) must be run via the shell.
const run = (cmd, args, opts = {}) =>
  spawn(cmd, args, { cwd: repoRoot, stdio: "inherit", shell: isWin, ...opts });

const probe = (cmd, args) =>
  spawnSync(cmd, args, { cwd: repoRoot, stdio: "ignore", shell: isWin }).status === 0;

// Pick docker compose v2 ("docker compose") or fall back to v1 ("docker-compose").
let dc;
if (probe("docker", ["compose", "version"])) dc = ["docker", ["compose"]];
else if (probe("docker-compose", ["version"])) dc = ["docker-compose", []];
else {
  console.error("ERROR: docker compose not found. Install Docker Desktop.");
  process.exit(1);
}

// Pick a python interpreter that actually HAS the browser-py deps (playwright +
// redis) — not just any python on PATH. On Windows the bare name "python" (run
// through the shell) often resolves to the Microsoft Store stub or a second
// interpreter without the deps, which makes the engine crash on startup. Prefer
// an explicit override, then the repo's .venv, then the usual names.
//
// The dep-probe uses shell:false + a full executable path so the `-c "..."`
// argument isn't mangled by the Windows shell's arg-splitting.
const pyDepsOK = (exe, extra = []) => {
  try {
    return spawnSync(exe, [...extra, "-c", "import playwright, redis"],
                     { cwd: repoRoot, stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
};

const venvPy = isWin
  ? join(repoRoot, ".venv", "Scripts", "python.exe")
  : join(repoRoot, ".venv", "bin", "python");

let py = null;
let pyArgs = [];
if (process.env.BROWSER_PY_PYTHON && pyDepsOK(process.env.BROWSER_PY_PYTHON)) {
  py = process.env.BROWSER_PY_PYTHON;                       // explicit override
} else if (existsSync(venvPy) && pyDepsOK(venvPy)) {
  py = venvPy;                                              // repo virtualenv (preferred)
} else {
  // Fall back to a python on PATH. Existence is enough here: if it turns out to
  // lack the deps and crashes, the engine is launched as OPTIONAL below, so the
  // dashboard keeps running instead of the whole stack going down.
  for (const [cmd, args] of [["python", []], ["python3", []], ["py", ["-3"]]]) {
    if (probe(cmd, [...args, "--version"])) { py = cmd; pyArgs = args; break; }
  }
}

// Parse REDIS_* vars from the backend .env so browser-py connects to the same
// Redis instance as the NestJS backend (not the local Docker one).
function _readRedisVars(envPath) {
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const raw of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (/^REDIS_(HOST|PORT|PASSWORD|URL)$/.test(key)) out[key] = line.slice(eq + 1).trim();
  }
  return out;
}
const _backendRedis = _readRedisVars(join(repoRoot, "apps", "backend", ".env"));

console.log("▶ Starting infra (Postgres + Redis)...");
const infra = spawnSync(dc[0], [...dc[1], "up", "-d", "postgres", "redis"], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: isWin,
});
if (infra.status !== 0) {
  console.error("ERROR: failed to start infra (Postgres + Redis).");
  process.exit(infra.status ?? 1);
}

console.log("▶ Launching backend + frontend + worker (turbo) and the Python engine...");
console.log("  (Ctrl-C stops everything)");

const children = [];
const start = (cmd, args, opts = {}) => {
  // Destructure well-known launcher opts so only real spawn opts (e.g. env)
  // reach run() / spawn(). This lets callers pass `env` for env-var injection.
  const { optional, name, ...spawnOpts } = opts;
  const child = run(cmd, args, spawnOpts);
  children.push(child);
  child.on("error", (err) => {
    if (optional) {
      console.warn(`⚠ Could not start ${name || cmd}: ${err.message}. Continuing without it.`);
      return;
    }
    console.error(`Failed to start ${cmd}: ${err.message}`);
    shutdown(1);
  });
  child.on("exit", (code) => {
    if (optional) {
      // The browser engine is OPTIONAL: if it dies, keep the dashboard +
      // backend running instead of tearing the whole stack down. (Live browser
      // execution is unavailable until it's restarted, but the UI stays up.)
      console.warn(
        `⚠ ${name || cmd} exited (code ${code}). The dashboard keeps running; ` +
        `live browser execution is OFF until you restart the stack.`
      );
      return;
    }
    // A core process (turbo dev = backend + frontend + worker) exiting tears the
    // whole stack down.
    shutdown(code ?? 0);
  });
  return child;
};

let shuttingDown = false;
const shutdown = (code) => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null) {
      try { child.kill(); } catch { /* already gone */ }
    }
  }
  process.exit(code);
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

start("pnpm", ["dev"]);
if (py) {
  if (Object.keys(_backendRedis).length) {
    const keys = Object.keys(_backendRedis).join(", ");
    console.log(`  Forwarding backend Redis config to browser-py (${keys})`);
  }
  start(py, [...pyArgs, "apps/browser-py/main.py"], {
    optional: true,
    name: "browser-py engine",
    env: { ...process.env, ..._backendRedis },
  });
} else {
  console.warn("⚠ No Python with the browser-py deps (playwright, redis) was found.");
  console.warn("  The dashboard + backend will run; live browser execution is OFF.");
  console.warn("  Fix: pip install -r apps/browser-py/requirements.txt && python -m playwright install chromium");
  console.warn("  (or set BROWSER_PY_PYTHON=/full/path/to/python.exe that has those deps)");
}
