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

// Pick a python interpreter.
let py;
for (const candidate of ["python", "python3", "py"]) {
  if (probe(candidate, ["--version"])) { py = candidate; break; }
}
if (!py) {
  console.error("ERROR: python not found on PATH.");
  process.exit(1);
}

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
const start = (cmd, args) => {
  const child = run(cmd, args);
  children.push(child);
  child.on("exit", (code) => {
    // If any process exits, tear the whole stack down.
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
start(py, ["apps/browser-py/main.py"]);
