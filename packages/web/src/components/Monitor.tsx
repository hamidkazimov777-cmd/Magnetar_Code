import React from "react";
import type {
  Message,
  PermissionMode,
  StateResponse,
  StreamMessage,
  TodoItem,
} from "@magnetar/core";
import { promptFor } from "@magnetar/core/commands";
import { api, openStream } from "../lib/client.js";
import { Stream, type Entry, type NewEntry } from "./Stream.js";
import { Composer } from "./Composer.js";
import { Approval } from "./Approval.js";
import { Sessions } from "./Sessions.js";
import { Files } from "./Files.js";
import { Memory } from "./Memory.js";
import { Todos } from "./Todos.js";

let nextId = 0;
const id = () => nextId++;

type Panel = "files" | "memory";

export function Monitor(): React.ReactElement {
  const [state, setState] = React.useState<StateResponse | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [streaming, setStreaming] = React.useState("");
  const [approval, setApproval] = React.useState<{
    id: string;
    tool: string;
    summary: string;
  } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [cost, setCost] = React.useState(0);
  const [step, setStep] = React.useState(0);
  const [todos, setTodos] = React.useState<readonly TodoItem[]>([]);
  const [panel, setPanel] = React.useState<Panel>("files");
  const [filesKey, setFilesKey] = React.useState(0);

  const streamBuffer = React.useRef("");

  const add = React.useCallback((entry: NewEntry) => {
    setEntries((current) => [...current, { ...entry, id: id() } as Entry]);
  }, []);

  const refresh = React.useCallback(async () => {
    const next = await api.state().catch((error: Error) => {
      setFailure(error.message);
      return null;
    });
    if (next) {
      setState(next);
      setBusy(next.busy);
      setTodos(next.todos);
      setCost(next.session.costUsd);
      setFailure(null);
    }
  }, []);

  const loadSession = React.useCallback(
    async (sessionId?: string) => {
      const opened = await api.session(sessionId).catch(() => null);
      if (!opened) return;
      setEntries(opened.messages.flatMap(toEntries));
      setCost(opened.meta.costUsd);
      void refresh();
    },
    [refresh],
  );

  React.useEffect(() => {
    void (async () => {
      await refresh();
      await loadSession();
    })();
  }, [refresh, loadSession]);

  React.useEffect(() => {
    const flush = () => {
      if (streamBuffer.current) {
        add({ kind: "assistant", text: streamBuffer.current });
        streamBuffer.current = "";
      }
      setStreaming("");
    };

    return openStream((message: StreamMessage) => {
      switch (message.type) {
        case "step":
          setBusy(true);
          setStep(message.step);
          break;
        case "delta":
          streamBuffer.current += message.text;
          setStreaming(streamBuffer.current);
          break;
        case "assistant":
          flush();
          break;
        case "tool_start":
          flush();
          add({
            kind: "tool",
            name: message.name,
            summary: message.summary,
            running: true,
          });
          break;
        case "tool_end":
          setEntries((current) => {
            const index = current.findLastIndex(
              (entry) => entry.kind === "tool" && entry.running && entry.name === message.name,
            );
            if (index === -1) return current;
            const next = [...current];
            next[index] = {
              ...(next[index] as Extract<Entry, { kind: "tool" }>),
              running: false,
              output: message.result.output,
              diff: message.result.diff,
              isError: message.result.isError,
            };
            return next;
          });
          if (message.result.diff) setFilesKey((key) => key + 1);
          break;
        case "approval_request":
          setApproval({ id: message.id, tool: message.tool, summary: message.summary });
          break;
        case "approval_resolved":
          setApproval((current) => (current?.id === message.id ? null : current));
          break;
        case "usage":
          setCost(message.costUsd);
          break;
        case "compacted":
          add({
            kind: "notice",
            text: `compacted ${message.before} messages into ${message.after}`,
          });
          break;
        case "notice":
          if (message.text) add({ kind: "notice", text: message.text });
          break;
        case "finished":
          flush();
          setBusy(false);
          setApproval(null);
          if (message.error) add({ kind: "error", text: message.error });
          if (message.stopReason === "max_steps")
            add({ kind: "notice", text: "stopped at the step limit" });
          void refresh();
          break;
        default:
          break;
      }
    });
  }, [add, refresh]);

  const send = async (text: string) => {
    if (!text || busy) return;
    add({ kind: "user", text });
    setBusy(true);
    await api.chat(text).catch((error: Error) => {
      setBusy(false);
      add({ kind: "error", text: error.message });
    });
  };

  /** The monitor handles the commands that make sense here and hands the rest
   *  to the model as a prompt; the terminal owns the ones that need a TTY. */
  const runCommand = async (name: string, argument: string) => {
    const macro = promptFor(name);
    if (macro) return send(argument ? `${macro}\n\n${argument}` : macro);
    switch (name) {
      case "/new":
        await api.newSession();
        return loadSession();
      case "/clear":
        return setEntries([]);
      case "/sessions":
        return refresh();
      case "/memory":
        return setPanel("memory");
      case "/files":
      case "/tree":
        return setPanel("files");
      case "/cost":
        return add({ kind: "notice", text: `${state?.session.costUsd.toFixed(4) ?? 0} USD` });
      case "/web":
        return add({ kind: "notice", text: "you are looking at it" });
      default:
        return add({
          kind: "notice",
          text: `${name} runs in the terminal — this view follows along`,
        });
    }
  };

  if (failure) {
    return (
      <div className="empty">
        <div className="empty-brand" style={{ marginBottom: 16 }}>
          <img src="/logo.png" alt="" />
          <h1>Magnetar</h1>
        </div>
        Cannot reach the agent: {failure}
        <div className="notice" style={{ marginTop: 8 }}>
          Start it with <code>magnetar web</code>.
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="header">
        <span className="brand">
          <img src="/logo.png" alt="" />
          Magnetar
          <span className="brand-tag">monitor</span>
        </span>
        <span className="crumbs">{state ? shorten(state.cwd) : "…"}</span>
        <span className="spacer" />
        {state && state.models.length > 0 ? (
          <select
            value={state.model}
            onChange={(event) => void api.setModel(event.target.value).then(refresh)}
          >
            {state.models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        ) : (
          <span className="crumbs">{state?.model}</span>
        )}
        <select
          value={state?.permissionMode ?? "ask"}
          onChange={(event) =>
            void api.setPermissionMode(event.target.value as PermissionMode).then(refresh)
          }
        >
          <option value="ask">ask</option>
          <option value="auto-edit">auto-edit</option>
          <option value="yolo">yolo</option>
        </select>
      </header>

      <div className="columns">
        <div className="col col-left">
          <Sessions
            sessions={state?.sessions ?? []}
            activeId={state?.session.id ?? ""}
            onOpen={(sessionId) => void loadSession(sessionId)}
            onNew={() => void api.newSession().then(() => loadSession())}
            onDelete={(sessionId) =>
              void api.deleteSession(sessionId).then(() => loadSession(undefined))
            }
          />
          <Todos items={todos} />
        </div>

        <div className="col-center">
          <Stream entries={entries} streaming={streaming} />
          {approval ? (
            <div className="composer">
              <Approval
                request={approval}
                onAnswer={(decision) => {
                  setApproval(null);
                  void api.approve(approval.id, decision);
                }}
              />
            </div>
          ) : (
            <Composer
              busy={busy}
              onSend={(text) => void send(text)}
              onCancel={() => void api.cancel()}
              onCommand={(name, argument) => void runCommand(name, argument)}
            />
          )}
        </div>

        <div className="col col-right">
          <div className="tabs">
            <button data-active={panel === "files"} onClick={() => setPanel("files")}>
              Files
            </button>
            <button data-active={panel === "memory"} onClick={() => setPanel("memory")}>
              Memory
            </button>
          </div>
          {panel === "files" ? <Files refreshKey={filesKey} /> : <Memory />}
        </div>
      </div>

      <footer className="status">
        <span>{busy ? `working · step ${step}` : "idle"}</span>
        <span>
          <b>{state?.provider.name}</b> · {state?.model}
        </span>
        <span>{state?.session.title}</span>
        <span className="spacer">{cost > 0 ? `$${cost.toFixed(cost < 0.01 ? 4 : 2)}` : ""}</span>
      </footer>
    </div>
  );
}

function toEntries(message: Message): Entry[] {
  if (message.role === "user" && message.content)
    return [{ id: id(), kind: "user", text: message.content }];
  if (message.role === "assistant" && message.content)
    return [{ id: id(), kind: "assistant", text: message.content }];
  if (message.role === "tool")
    return [
      {
        id: id(),
        kind: "tool",
        name: message.name ?? "tool",
        summary: "",
        output: message.content ?? "",
        running: false,
      },
    ];
  return [];
}

function shorten(cwd: string): string {
  const match = /\/Users\/[^/]+(\/.*)?$/.exec(cwd);
  return match ? `~${match[1] ?? ""}` : cwd;
}
