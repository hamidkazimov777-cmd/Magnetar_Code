import React from "react";
import { createRequire } from "node:module";
import { render } from "ink";
import { HELP, parseArgs } from "./args.js";
import { App } from "./app.js";
import { ProviderWizard } from "./provider.js";
import { createRuntime, SetupError } from "./runtime.js";
import { readStdin, runHeadless } from "./headless.js";
import { runWeb } from "./web.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (args.errors.length > 0) {
    process.stderr.write(`${args.errors.join("\n")}\n\nRun magnetar --help\n`);
    return 2;
  }
  if (args.command === "help") {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  if (args.command === "version") {
    process.stdout.write(`${version}\n`);
    return 0;
  }
  if (args.command === "provider") {
    const { waitUntilExit } = render(<ProviderWizard />);
    await waitUntilExit();
    return 0;
  }
  if (args.command === "web") return runWeb();

  const piped = await readStdin();
  const prompt = [args.print, args.initialMessage, piped].filter(Boolean).join("\n\n");

  // Anything piped in, or -p, means nobody is watching a UI.
  const headless = args.print !== undefined || (!process.stdin.isTTY && piped.length > 0);

  try {
    if (args.command === "doctor") {
      const runtime = await createRuntime(args);
      const models = await runtime.provider.listModels().catch((error: Error) => error);
      process.stdout.write(
        [
          `magnetar    ${version}`,
          `node        ${process.version}`,
          `provider    ${runtime.profile.name} (${runtime.profile.baseUrl})`,
          `model       ${runtime.model}`,
          `directory   ${runtime.cwd}`,
          `approval    ${runtime.permissions.getMode()}`,
          Array.isArray(models)
            ? `endpoint    reachable · ${models.length} models`
            : `endpoint    FAILED · ${models.message}`,
          "",
        ].join("\n"),
      );
      return Array.isArray(models) ? 0 : 1;
    }

    if (headless) {
      if (!prompt) {
        process.stderr.write("Nothing to do: -p needs a prompt, or pipe something in.\n");
        return 2;
      }
      return await runHeadless(args, prompt);
    }

    const runtime = await createRuntime(args);
    const { waitUntilExit } = render(
      <App
        runtime={runtime}
        version={version}
        initialMessage={args.initialMessage}
        maxSteps={args.maxSteps ?? 25}
        maxCostUsd={args.maxCostUsd}
      />,
      { exitOnCtrlC: false },
    );
    await waitUntilExit();
    return 0;
  } catch (error) {
    if (error instanceof SetupError) {
      process.stderr.write(`${error.message}\n`);
      return 2;
    }
    throw error;
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: Error) => {
    process.stderr.write(`magnetar: ${error.message}\n`);
    process.exitCode = 1;
  },
);
