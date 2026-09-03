import path from "node:path";
import {
  OpenAICompatibleProvider,
  Permissions,
  Session,
  activeProvider,
  buildSystemPrompt,
  defaultTools,
  getSecret,
  loadConfig,
  TodoStore,
  type MagnetarConfig,
  type PermissionMode,
  type ProviderProfile,
  type Tool,
} from "@magnetar/core";
import type { ParsedArgs } from "./args.js";

export class SetupError extends Error {}

/** Everything a run needs, assembled once and shared by the TUI and the
 *  headless path so the two cannot drift. */
export interface Runtime {
  config: MagnetarConfig;
  profile: ProviderProfile;
  provider: OpenAICompatibleProvider;
  model: string;
  session: Session;
  permissions: Permissions;
  tools: Tool[];
  todos: TodoStore;
  systemPrompt: string;
  cwd: string;
}

export async function createRuntime(args: ParsedArgs): Promise<Runtime> {
  const cwd = path.resolve(args.cwd ?? process.cwd());
  const config = await loadConfig();
  const profile = activeProvider(config);
  if (!profile) {
    throw new SetupError(
      "No provider configured yet. Run `magnetar provider` to add one — it takes an API key and nothing else.",
    );
  }

  const apiKey = await getSecret(profile.id);
  if (!apiKey && !profile.keyless) {
    throw new SetupError(
      `No API key stored for ${profile.name}. Run \`magnetar provider\` to set it, or export MAGNETAR_API_KEY.`,
    );
  }

  const provider = new OpenAICompatibleProvider({
    baseUrl: profile.baseUrl,
    apiKey,
    referer: "https://github.com/hamidkazimov777-cmd/Magnetar-Web-UI",
    title: "Magnetar Code",
  });

  const model = args.model ?? profile.model;
  const session = await openSession(args, cwd, model);
  const mode: PermissionMode = args.permissionMode ?? config.permissionMode;
  const permissions = await Permissions.load(cwd, mode);
  const todos = new TodoStore();

  return {
    config,
    profile,
    provider,
    model,
    session,
    permissions,
    tools: defaultTools({ todos }),
    todos,
    systemPrompt: await buildSystemPrompt({ cwd, permissionMode: mode, locale: config.locale }),
    cwd,
  };
}

async function openSession(args: ParsedArgs, cwd: string, model: string): Promise<Session> {
  if (args.resume) {
    const session = await Session.open(cwd, args.resume);
    if (!session) throw new SetupError(`No session ${args.resume} in this directory.`);
    return session;
  }
  if (args.continue) {
    const [newest] = await Session.list(cwd);
    if (newest) {
      const session = await Session.open(cwd, newest.id);
      if (session) return session;
    }
  }
  return Session.create(cwd, model);
}
