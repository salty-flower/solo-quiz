import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const cwd = process.cwd();
const args = process.argv.slice(2);

const candidates = [
  join(cwd, "node_modules", "rolldown-vite", "bin", "vite.js"),
  join(cwd, "node_modules", "vite", "bin", "vite.js"),
];

const bin = candidates.find((candidate) => existsSync(candidate));

if (!bin) {
  console.error("No local Vite binary found. Did you install dependencies?");
  process.exit(1);
}

const child = spawn("node", [bin, ...args], {
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
