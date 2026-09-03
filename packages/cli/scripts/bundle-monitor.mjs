import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* The monitor is a static bundle served by the daemon, so a published install
   carries it inside the CLI package. Nothing here talks to npm: the web
   workspace is built first by the root build script. */
const here = path.dirname(fileURLToPath(import.meta.url));
const from = path.resolve(here, "..", "..", "web", "dist");
const to = path.resolve(here, "..", "dist", "monitor");

const built = await fs.stat(from).catch(() => null);
if (!built) {
  console.warn(
    "bundle-monitor: packages/web/dist is missing — run `npm run build -w @magnetar/web` first",
  );
  process.exit(0);
}

await fs.rm(to, { recursive: true, force: true });
await fs.cp(from, to, { recursive: true });
console.log(`bundle-monitor: copied the monitor into ${path.relative(process.cwd(), to)}`);
