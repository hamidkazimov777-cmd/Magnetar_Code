import { defineConfig } from "tsup";

/* @magnetar/core is a private workspace package, so it is bundled into the
   published output rather than listed as a dependency. It has no runtime deps
   of its own, so this stays small. */
export default defineConfig({
  entry: { cli: "src/cli.tsx" },
  format: ["esm"],
  target: "node20",
  platform: "node",
  bundle: true,
  clean: true,
  noExternal: ["@magnetar/core"],
  banner: { js: "#!/usr/bin/env node" },
});
