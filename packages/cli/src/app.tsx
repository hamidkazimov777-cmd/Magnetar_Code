import React from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import {
  Session,
  formatCost,
  runAgent,
  saveConfig,
  type AgentEvent,
  type Approval as Answer,
  type ApprovalRequest,
  type PermissionMode,
} from "@magnetar/core";
import { StatusBar } from "./components/StatusBar.js";
import { TextInput } from "./components/TextInput.js";
import { Picker, type PickerItem } from "./components/Picker.js";
import { Approval } from "./components/Approval.js";
import { ProviderWizard } from "./provider.js";
import { openBrowser, startMonitor } from "./web.js";
import { Transcript, type Item } from "./components/Transcript.js";
import { filterCommands, resolveCommand } from "./commands.js";
import { renderMarkdown } from "./markdown.js";
import { theme } from "./theme.js";
import type { Runtime } from "./runtime.js";
import type { Daemon } from "@magnetar/core";
import * as actions from "./actions.js";

type Overlay =
  | { kind: "none" }
  | { kind: "approval"; request: ApprovalRequest; resolve: (answer: Answer) => void }
  | { kind: "picker"; title: string; items: PickerItem[]; onSelect: (value: string) => void }
  | { kind: "provider" };

interface Props {
  runtime: Runtime;
  version: string;
  initialMessage?: string;
  maxSteps: number;
  maxCostUsd?: number;
  /** Rebuilds the runtime after the provider changes, so a new key takes
   *  effect without restarting the session. */
  reload?: () => Promise<Runtime>;
}

let nextId = 0;
const id = () => `i${nextId++}`;

export function App({
  runtime: initialRuntime,
  version,
  initialMessage,
  maxSteps,
  maxCostUsd,
  reload,
}: Props): React.ReactElement {
  const [runtime, setRuntime] = React.useState(initialRuntime);
  const { exit } = useApp();
  const { stdout } = useStdout();
  const width = Math.max(40, (stdout?.columns ?? 80) - 2);

  const [items, setItems] = React.useState<Item[]>([
    {
      id: id(),
      kind: "banner",
      text: "",
      banner: {
        cwd: runtime.cwd,
        model: runtime.model,
        provider: runtime.profile.name,
        version,
        session: runtime.session.meta.id,
      },
    },
  ]);
  const [draft, setDraft] = React.useState("");
  const [history, setHistory] = React.useState<string[]>([]);
  const [streaming, setStreaming] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [step, setStep] = React.useState(0);
  const [cost, setCost] = React.useState(runtime.session.meta.costUsd);
  const [tokens, setTokens] = React.useState(0);
  const [model, setModel] = React.useState(runtime.model);
  const [mode, setMode] = React.useState<PermissionMode>(runtime.permissions.getMode());
  const [session, setSession] = React.useState(runtime.session);
  const [overlay, setOverlay] = React.useState<Overlay>({ kind: "none" });
  const [paletteIndex, setPaletteIndex] = React.useState(0);
  const [quitHint, setQuitHint] = React.useState(false);

  const abort = React.useRef<AbortController | null>(null);
  const touched = React.useRef<Set<string>>(new Set());
  const streamBuffer = React.useRef("");
  const daemon = React.useRef<Daemon | null>(null);

  const say = React.useCallback((item: Omit<Item, "id">) => {
    setItems((current) => [...current, { ...item, id: id() }]);
  }, []);

  const palette = React.useMemo(
    () => (draft.startsWith("/") && overlay.kind === "none" ? filterCommands(draft) : []),
    [draft, overlay.kind],
  );

  /* ---------------------------------------------------------------- agent */

  const send = React.useCallback(
    async (prompt: string) => {
      const controller = new AbortController();
      abort.current = controller;
      setBusy("thinking");
      setStep(0);
      streamBuffer.current = "";

      const flush = () => {
        if (streamBuffer.current) {
          say({ kind: "assistant", text: streamBuffer.current });
          streamBuffer.current = "";
        }
        setStreaming("");
      };

      const onEvent = (event: AgentEvent) => {
        switch (event.type) {
          case "step":
            setStep(event.step);
            setBusy("thinking");
            break;
          case "delta":
            streamBuffer.current += event.text;
            setStreaming(streamBuffer.current);
            break;
          case "assistant":
            flush();
            break;
          case "tool_start":
            flush();
            setBusy(`${event.name} ${event.summary}`.slice(0, 60));
            break;
          case "tool_end": {
            const first = event.result.output.split("\n")[0] ?? "";
            say({
              kind: "tool",
              name: event.name,
              text: event.result.isError ? first : summarise(event.name, first),
              diff: event.result.diff,
              isError: event.result.isError,
            });
            break;
          }
          case "usage":
            setTokens((current) => current + event.usage.inputTokens + event.usage.outputTokens);
            setCost(event.costUsd + session.meta.costUsd);
            break;
          case "compacted":
            say({ kind: "notice", text: `compacted ${event.before} messages into ${event.after}` });
            break;
          case "notice":
            say({ kind: "notice", text: event.text });
            break;
        }
      };

      const result = await runAgent(prompt, {
        provider: runtime.provider,
        model,
        tools: runtime.tools,
        permissions: runtime.permissions,
        session,
        cwd: runtime.cwd,
        systemPrompt: runtime.systemPrompt,
        maxSteps,
        maxCostUsd,
        signal: controller.signal,
        onEvent,
        requestApproval: (request) =>
          new Promise<Answer>((resolve) => {
            if (request.tool.name !== "run_command") {
              const file = request.args.file_path;
              if (typeof file === "string") touched.current.add(file);
            }
            setOverlay({
              kind: "approval",
              request,
              resolve: (answer) => {
                setOverlay({ kind: "none" });
                resolve(answer);
              },
            });
          }),
      });

      flush();
      abort.current = null;
      setBusy(null);
      if (result.stopReason === "cancelled") say({ kind: "notice", text: "stopped" });
      if (result.error) say({ kind: "error", text: result.error.message });
    },
    [maxCostUsd, maxSteps, model, runtime, say, session],
  );

  /* -------------------------------------------------------------- commands */

  const runSlash = React.useCallback(
    async (input: string) => {
      const resolved = resolveCommand(input);
      if (!resolved) {
        say({ kind: "error", text: `unknown command: ${input.split(" ")[0]} — try /help` });
        return;
      }
      const { command, argument } = resolved;
      switch (command.name) {
        case "/help":
          return say({ kind: "raw", text: actions.helpText() });
        case "/exit":
          return exit();
        case "/clear":
          return setItems([]);
        case "/tools":
          return say({ kind: "raw", text: actions.toolsText(runtime) });
        case "/cost":
          return say({ kind: "notice", text: actions.costText({ ...runtime, session, model }) });
        case "/context":
          return say({ kind: "notice", text: actions.contextText({ ...runtime, session }) });
        case "/memory":
          return say({ kind: "raw", text: await actions.memoryText(runtime.cwd) });
        case "/init":
          return send(actions.initPrompt());
        case "/diff":
          return say({ kind: "raw", text: await actions.diffText(runtime.cwd) });
        case "/undo":
          return say({
            kind: "notice",
            text: await actions.undoFiles(runtime.cwd, [...touched.current]),
          });
        case "/export":
          return say({
            kind: "notice",
            text: await actions.exportSession({ ...runtime, session }),
          });
        case "/compact": {
          setBusy("compacting");
          const text = await actions.compactNow({ ...runtime, session, model });
          setBusy(null);
          return say({ kind: "notice", text });
        }
        case "/new": {
          const fresh = await Session.create(runtime.cwd, model);
          setSession(fresh);
          setItems([]);
          setCost(0);
          setTokens(0);
          return say({ kind: "notice", text: `new session ${fresh.meta.id}` });
        }
        case "/add": {
          if (!argument) return say({ kind: "error", text: "usage: /add <path>" });
          try {
            const message = await actions.attachFile(runtime.cwd, argument);
            await session.append(message);
            return say({ kind: "notice", text: `attached ${argument}` });
          } catch (error) {
            return say({ kind: "error", text: (error as Error).message });
          }
        }
        case "/sessions": {
          const list = await Session.list(runtime.cwd);
          if (list.length === 0) return say({ kind: "notice", text: "no earlier sessions here" });
          return setOverlay({
            kind: "picker",
            title: "Sessions",
            items: list.map((meta) => ({
              value: meta.id,
              label: meta.title,
              hint: `${new Date(meta.updatedAt).toLocaleString()} · ${meta.messageCount} msg · ${formatCost(meta.costUsd)}`,
            })),
            onSelect: async (value) => {
              setOverlay({ kind: "none" });
              const opened = await Session.open(runtime.cwd, value);
              if (!opened) return say({ kind: "error", text: "could not open that session" });
              setSession(opened);
              setCost(opened.meta.costUsd);
              setItems(
                opened.history().flatMap((message): Item[] => {
                  if (message.role === "user" && message.content)
                    return [{ id: id(), kind: "user", text: message.content }];
                  if (message.role === "assistant" && message.content)
                    return [{ id: id(), kind: "assistant", text: message.content }];
                  return [];
                }),
              );
              say({ kind: "notice", text: `resumed ${opened.meta.title}` });
            },
          });
        }
        case "/model": {
          const models = runtime.profile.models?.length
            ? runtime.profile.models
            : await runtime.provider.listModels().catch(() => [] as string[]);
          if (models.length === 0)
            return say({ kind: "error", text: "the provider returned no models" });
          return setOverlay({
            kind: "picker",
            title: "Model",
            items: models.map((value) => ({ value, label: value })),
            onSelect: async (value) => {
              setOverlay({ kind: "none" });
              setModel(value);
              const config = runtime.config;
              const profile = config.providers.find((p) => p.id === runtime.profile.id);
              if (profile) {
                profile.model = value;
                profile.models = models;
                await saveConfig(config);
              }
              say({ kind: "notice", text: `model: ${value}` });
            },
          });
        }
        case "/permissions":
          return setOverlay({
            kind: "picker",
            title: "Approval mode",
            items: [
              { value: "ask", label: "ask", hint: "confirm every edit and command (default)" },
              {
                value: "auto-edit",
                label: "auto-edit",
                hint: "edit files freely, still ask before commands",
              },
              { value: "yolo", label: "yolo", hint: "never ask — only in a directory you trust" },
            ],
            onSelect: async (value) => {
              setOverlay({ kind: "none" });
              const next = value as PermissionMode;
              runtime.permissions.setMode(next);
              setMode(next);
              await saveConfig({ ...runtime.config, permissionMode: next });
              say({ kind: "notice", text: `approval mode: ${next}` });
            },
          });
        case "/provider":
          return setOverlay({ kind: "provider" });
        case "/web": {
          if (daemon.current) {
            openBrowser(daemon.current.url);
            return say({ kind: "notice", text: `monitor: ${daemon.current.url}` });
          }
          setBusy("starting the monitor");
          const started = await startMonitor({ ...runtime, session, model }, version, maxSteps);
          setBusy(null);
          if (!started) {
            return say({ kind: "error", text: "no monitor bundled in this install" });
          }
          daemon.current = started;
          openBrowser(started.url);
          return say({ kind: "notice", text: `monitor: ${started.url}` });
        }
        case "/doctor":
          return say({ kind: "raw", text: await doctorText(runtime, model) });
        default:
          return say({ kind: "notice", text: `${command.name} is not wired up yet` });
      }
    },
    [exit, model, runtime, say, send, session],
  );

  const submit = React.useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      setDraft("");
      setHistory((current) => [...current.filter((entry) => entry !== text), text]);

      if (palette.length > 0 && text.startsWith("/")) {
        const chosen = palette[Math.min(paletteIndex, palette.length - 1)];
        // Enter on the palette picks the highlighted command unless the user
        // has already typed one out in full.
        const exact = resolveCommand(text);
        const command = exact ? text : (chosen?.name ?? text);
        setPaletteIndex(0);
        say({ kind: "user", text: command });
        return runSlash(command);
      }
      if (text.startsWith("/")) {
        say({ kind: "user", text });
        return runSlash(text);
      }
      say({ kind: "user", text });
      await send(text);
    },
    [busy, palette, paletteIndex, runSlash, say, send],
  );

  /* ----------------------------------------------------------------- input */

  useInput(
    (input, key) => {
      if (key.escape && busy) {
        abort.current?.abort();
        return;
      }
      if (key.ctrl && input === "c") {
        if (busy) {
          abort.current?.abort();
          return;
        }
        if (quitHint) return exit();
        setQuitHint(true);
        setTimeout(() => setQuitHint(false), 2000);
      }
    },
    { isActive: overlay.kind === "none" },
  );

  React.useEffect(() => {
    if (initialMessage) void submit(initialMessage);
    // Deliberately once, on mount: this is the message from argv.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------------ view */

  return (
    <Box flexDirection="column">
      <Transcript items={items} width={width} />

      {streaming ? (
        <Box marginBottom={1}>
          <Text>{renderMarkdown(streaming, width)}</Text>
        </Box>
      ) : null}

      {overlay.kind === "approval" ? (
        <Approval request={overlay.request} onAnswer={overlay.resolve} />
      ) : null}

      {overlay.kind === "provider" ? (
        <ProviderWizard
          onDone={async (saved) => {
            setOverlay({ kind: "none" });
            if (!saved || !reload) return;
            const next = await reload().catch((error: Error) => {
              say({ kind: "error", text: error.message });
              return null;
            });
            if (next) {
              setRuntime(next);
              setModel(next.model);
              say({ kind: "notice", text: `provider: ${next.profile.name} · ${next.model}` });
            }
          }}
        />
      ) : null}

      {overlay.kind === "picker" ? (
        <Picker
          title={overlay.title}
          items={overlay.items}
          onSelect={overlay.onSelect}
          onCancel={() => setOverlay({ kind: "none" })}
        />
      ) : null}

      {palette.length > 0 ? (
        <Box flexDirection="column" borderStyle="single" borderColor={theme.border} paddingX={1}>
          {palette.slice(0, 8).map((command, index) => (
            <Text key={command.name} color={index === paletteIndex ? theme.accent : theme.dim}>
              {index === paletteIndex ? "▶ " : "  "}
              {command.name.padEnd(13)} {command.description}
            </Text>
          ))}
        </Box>
      ) : null}

      {overlay.kind === "none" ? (
        <Box borderStyle="single" borderColor={busy ? theme.accentDim : theme.border} paddingX={1}>
          <Text color={theme.accent}>{"› "}</Text>
          <TextInput
            value={draft}
            onChange={setDraft}
            onSubmit={submit}
            history={history}
            focus={!busy}
            placeholder={busy ? "working — esc to stop" : "ask, or / for commands"}
            onArrow={(direction) => {
              if (palette.length === 0) return false;
              setPaletteIndex((current) => {
                const next = direction === "up" ? current - 1 : current + 1;
                const max = Math.min(palette.length, 8);
                return (next + max) % max;
              });
              return true;
            }}
          />
        </Box>
      ) : null}

      <StatusBar
        mode={quitHint ? "press ctrl+c again to quit" : mode}
        model={model}
        busy={busy}
        step={step}
        maxSteps={maxSteps}
        costUsd={cost}
        tokens={tokens}
      />
    </Box>
  );
}

/** Tool output is for the model; the transcript shows a one-line trace. */
function summarise(name: string, firstLine: string): string {
  if (name === "run_command") return firstLine.slice(0, 100);
  return firstLine.slice(0, 100);
}

async function doctorText(runtime: Runtime, model: string): Promise<string> {
  const lines = [
    `provider   ${runtime.profile.name} (${runtime.profile.baseUrl})`,
    `model      ${model}`,
    `directory  ${runtime.cwd}`,
    `approval   ${runtime.permissions.getMode()}`,
  ];
  try {
    const models = await runtime.provider.listModels();
    lines.push(`endpoint   reachable · ${models.length} models`);
    if (!models.includes(model)) lines.push(`warning    ${model} is not in the provider's list`);
  } catch (error) {
    lines.push(`endpoint   FAILED · ${(error as Error).message}`);
  }
  return lines.join("\n");
}
