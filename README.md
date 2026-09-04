<div align="center">

# ▚ Magnetar Code

**A coding agent that lives in your terminal — and a local browser view of it.**

Bring your own key. Any OpenAI-compatible endpoint: OpenRouter, TokenRouter,
Kimi, OpenAI, DeepSeek, Together, LM Studio, Ollama.

[![CI](https://github.com/hamidkazimov777-cmd/Magnetar_Code/actions/workflows/ci.yml/badge.svg)](https://github.com/hamidkazimov777-cmd/Magnetar_Code/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/magnetar-code?color=f5a623&label=npm)](https://www.npmjs.com/package/magnetar-code)
[![node](https://img.shields.io/badge/node-%E2%89%A520.11-f5a623)](https://nodejs.org)
[![license](https://img.shields.io/badge/license-MIT-f5a623)](LICENSE)

[Русская версия](README.ru.md)

</div>

```bash
npm i -g magnetar-code
magnetar provider     # pick a preset, paste your key
magnetar              # start working in this directory
```

---

## Install, step by step

**1. Check Node.js.** You need version 20 or newer.

```bash
node -v
```

No Node, or a number below 20? Install the LTS build from
[nodejs.org](https://nodejs.org) and reopen your terminal.

**2. Install.**

```bash
npm i -g magnetar-code
```

On a permission error (`EACCES`), run the same command with `sudo`.

**3. Check it.**

```bash
magnetar --version
```

If the shell says `command not found`, reopen the terminal.

**4. Connect your key.**

```bash
magnetar provider
```

Arrow keys pick a provider, then paste your API key, then choose a model. The
key is yours — none ships with the package.

**5. Work.** Go to a project folder and run `magnetar`. Press `/` for commands,
`Ctrl+C` twice to quit.

### Update

```bash
npm i -g magnetar-code@latest
```

### Uninstall

```bash
npm uninstall -g magnetar-code
```

If you had linked a source checkout, run `npm unlink -g magnetar-code` first.

### Something is wrong

```bash
magnetar doctor
```

It checks the key, the endpoint and the model, and says which one is at fault.

**New here?** The [complete guide](docs/GUIDE.md) walks through every command
with examples, from installing to shipping an app.

## The monitor

`magnetar web` opens the same session in a browser: the live stream, every tool
call with the diff it produced, the file tree with changed files marked, the
plan the agent is working to, and the project's memory — editable in place.

![The Magnetar monitor showing a tool call and its diff](docs/images/monitor.png)

It is not a second chat. It is a window onto the run that is already happening
in your terminal — the same sessions, the same context, either place.

## You approve what it does

Read-only tools run freely. Anything that changes your machine stops and asks,
in the terminal or in the browser, whichever you are looking at.

![An approval prompt for a file write](docs/images/approval.png)

`y` allows once, `a` stops asking about that command in this project, `n`
denies and tells the model why. Inspection commands like `git status` never
interrupt you — being asked the same harmless question five times is how people
learn to approve without reading.

## Why another one

Most of these are a chat box with a filesystem attached. This one is built
around the three things that actually go wrong:

**It stops.** A step ceiling, an optional dollar budget, and a cancel that
kills the command it started. No agent should be able to loop until your
wallet notices.

**It stays inside the project.** Every path a tool touches is resolved inside
your working directory. `../../.ssh/id_rsa` is refused, not fetched.

**It does not lose your work.** Sessions are append-only files flushed every
turn, so a crash mid-task keeps the task. The transcript compacts itself before
the context window fills, instead of dying at a 400 from the provider.

And your key goes to the system keychain, never to a config file and never to
the browser. Requests are made by the Node process; the monitor only ever sees
text.

## Bring your own key

```bash
magnetar provider
```

Pick an endpoint from the list, paste a key, choose a model — the model list is
fetched from the provider, whatever shape it answers in. Local endpoints
(LM Studio, Ollama) skip the key entirely.

## Scripts and CI

```bash
magnetar -p "which routes does this app expose?"
cat error.log | magnetar -p "why does this fail"
magnetar -p "add a health check" --permission-mode auto-edit --output-format json
```

`--output-format json` prints the answer, session id, steps taken, token usage
and cost as one object. Nobody is at the keyboard in a script, so a tool that
would need approval is refused rather than left hanging.

## In the session

Type `/` for the palette: `/model`, `/sessions`, `/cost`, `/context`, `/diff`,
`/undo`, `/compact`, `/init`, `/memory`, `/permissions`, `/export`, `/web`,
`/doctor`.

`enter` sends · `\` then `enter` starts a new line · `↑` `↓` walk your history ·
`esc` stops the current turn · `ctrl+c` twice quits.

## Project memory

`MAGNETAR.md` in your repository root goes into every system prompt — build
commands, conventions, the things you would tell a new engineer. `/init` writes
a first draft by reading the repository. Individual facts live one per file
under `.magnetar/memory/`, so what the agent has been told shows up in a diff
and can be committed like anything else.

## Options

```
-p, --print <text>       answer once and exit
    --output-format      text | json
-m, --model <id>         override the model for this run
-C, --cwd <dir>          run against another directory
-c, --continue           resume the most recent session here
-r, --resume <id>        resume a specific session
    --permission-mode    ask | auto-edit | yolo
    --max-steps <n>      stop after n agent steps (default 25)
    --max-cost <usd>     stop once a run costs this much
```

## Repository

| Package         | npm                                                            | What it is                                             |
| --------------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| `packages/core` | internal                                                       | Providers, agent loop, tools, sessions, memory, daemon |
| `packages/cli`  | [`magnetar-code`](https://www.npmjs.com/package/magnetar-code) | The Ink TUI and the non-interactive mode               |
| `packages/web`  | internal                                                       | The monitor, bundled into the CLI at build time        |

```bash
npm install     # from the root — npm workspaces
npm run check   # format + lint + typecheck + test
npm run build   # the monitor, then the CLI with the monitor inside it
npm run cli     # run the CLI from source
```

Node 20.11 or newer. CI runs the checks and the build on Node 20, 22 and 24.

## Security

An agent that runs shell commands deserves a threat model, not a disclaimer.
[SECURITY.md](SECURITY.md) covers the approval boundary, the path sandbox,
where keys live, and what the daemon's token and origin check actually protect
against.

## License

MIT © Hamid Kazimov
