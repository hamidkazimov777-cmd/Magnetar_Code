# magnetar-code

A terminal AI coding agent. Bring your own key — it talks to any
OpenAI-compatible endpoint (OpenRouter, TokenRouter, Kimi, OpenAI, DeepSeek,
Together, LM Studio, Ollama).

```bash
npm i -g magnetar-code
magnetar provider   # pick a preset, paste an API key
magnetar            # start working in the current directory
```

Or without installing: `npx magnetar-code`.

## What it does

Reads and edits files, runs commands, searches the repository, and keeps a plan
while it works. Every file write and every shell command is shown to you for
approval before it runs; read-only commands like `git status` do not interrupt
you. Approve once with `y`, or `a` to stop being asked for that command in this
project.

API keys go to your system keychain, never into a config file.

## Non-interactive

```bash
magnetar -p "which routes does this app expose?"
cat error.log | magnetar -p "why does this fail"
magnetar -p "add a health check" --permission-mode auto-edit --output-format json
```

`--output-format json` prints the answer, the session id, the steps taken, token
usage and cost as one JSON object — for scripts and CI.

## In the session

Type `/` for the command palette: `/model`, `/sessions`, `/cost`, `/context`,
`/diff`, `/undo`, `/compact`, `/init`, `/memory`, `/permissions`, `/export`.

`enter` sends · `\` then `enter` starts a new line · `↑` `↓` walk your input
history · `esc` stops a running turn · `ctrl+c` twice quits.

## Project memory

`MAGNETAR.md` in the repository root is loaded into every session — put your
build commands, conventions and gotchas there. `/init` writes a first draft.

## Options

```
-p, --print <text>       answer once and exit
    --output-format      text | json
-m, --model <id>         override the model
-C, --cwd <dir>          run against another directory
-c, --continue           resume the most recent session here
-r, --resume <id>        resume a specific session
    --permission-mode    ask | auto-edit | yolo
    --max-steps <n>      stop after n agent steps (default 25)
    --max-cost <usd>     stop once a run costs this much
```

MIT © Hamid Kazimov
