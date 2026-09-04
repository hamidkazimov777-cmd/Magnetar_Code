# Magnetar Code — the complete guide

Everything Magnetar does, in plain language, with examples. From installing it
to shipping a finished app.

---

## Contents

1. [What this is](#1-what-this-is)
2. [Installing](#2-installing)
3. [Connecting a model](#3-connecting-a-model)
4. [First run](#4-first-run)
5. [How it works inside](#5-how-it-works-inside)
6. [Approvals — the important part](#6-approvals--the-important-part)
7. [Worked example: an app from nothing to release](#7-worked-example-an-app-from-nothing-to-release)
8. [Project memory](#8-project-memory)
9. [The browser monitor](#9-the-browser-monitor)
10. [Every command](#10-every-command)
11. [Scripts and CI](#11-scripts-and-ci)
12. [Command-line flags](#12-command-line-flags)
13. [When something breaks](#13-when-something-breaks)

---

## 1. What this is

Magnetar is a programming assistant that lives in your terminal. You describe a
task in words; it reads your project's files, searches the code, makes changes
and runs commands.

Two parts matter:

**The model is the brain.** It thinks and decides what to do. You connect
whichever one you like: GPT, Claude, Gemini, DeepSeek, Kimi, or one running
locally on your own machine.

**Magnetar is the hands.** It invents nothing. It hands the model tools — read
a file, find code, write, run a command — and makes sure nothing gets out of
hand.

Which gives you a simple rule: **the stronger the model, the smarter the
agent**. On a cheap, fast model it will ask you obvious questions. On a strong
one it works things out itself.

---

## 2. Installing

You need Node.js 20 or newer.

```bash
node -v
```

If that says `command not found`, or a number below 20, get the LTS build from
[nodejs.org](https://nodejs.org), install it like any other application, and
reopen your terminal.

Install:

```bash
npm i -g magnetar-code
```

Check:

```bash
magnetar --version
```

If the shell still says `command not found`, close the terminal and open it
again.

If the install failed with `EACCES`, that is a permissions problem — run the
same command with `sudo`.

**Update:**

```bash
npm i -g magnetar-code@latest
```

**Uninstall:**

```bash
npm uninstall -g magnetar-code
```

---

## 3. Connecting a model

Magnetar ships with no keys. You bring your own access to whichever service you
already use.

```bash
magnetar provider
```

Four steps:

**Step 1 — the service.** Arrow keys pick from the list:

| Service           | What it is                                 |
| ----------------- | ------------------------------------------ |
| OpenRouter        | Hundreds of models behind one key          |
| TokenRouter       | Same idea, different provider              |
| Kimi (Moonshot)   | Moonshot's models                          |
| OpenAI            | GPT directly                               |
| DeepSeek          | DeepSeek directly                          |
| Together          | Open models                                |
| LM Studio (local) | A model on your own machine, no key needed |
| Ollama (local)    | Same                                       |
| Custom endpoint   | Any URL of your own                        |

**Step 2 — the API key.** Paste the key for that service. It goes into your
system keychain, not into a text file.

**Step 3 — the model.** Magnetar asks the service which models it has and shows
the list. Start typing to filter it.

**Step 4 — the model that analyses your project.** A separate model that reads
your repository and writes its memory (section 8). It runs rarely, so point it
at something strong. Choosing the same one is fine.

You can change any of this later without retyping a key:

- `/model` — the everyday model
- `/memory-model` — the analyst
- `/provider` — switch between the services you already set up, or add one

Add as many as you like. Each key lives in the keychain under its own profile,
so moving between DeepSeek and OpenRouter is two keystrokes rather than pasting
a key again. In the browser the switcher sits in the header, next to the model.

---

## 4. First run

Go into a project folder and start:

```bash
cd ~/my-project
magnetar
```

You get a header with the folder, the service, the model and a session id.
Then just describe what you want:

```
have a look at this project and describe how it is laid out
```

**Keys:**

| Key              | What it does              |
| ---------------- | ------------------------- |
| `Enter`          | Send                      |
| `\` then `Enter` | New line inside a message |
| `↑` `↓`          | Your message history      |
| `/`              | Open the command palette  |
| `Esc`            | Stop the agent mid-run    |
| `Ctrl+C` twice   | Quit                      |

---

## 5. How it works inside

When you send a task, a loop begins:

1. Magnetar assembles a **system prompt**: your OS, your directory, the git
   branch, what sits in the project root, and your own rules from `MAGNETAR.md`.
2. It sends the model your task along with the list of tools.
3. The model replies — either with text, or by asking to call a tool.
4. Magnetar runs the tool (asking you first if it is dangerous) and hands the
   result back.
5. Steps 3–4 repeat until the model says it is done.

**The tools the model has:**

| Tool          | What it does                                 | Asks you? |
| ------------- | -------------------------------------------- | --------- |
| `read_file`   | Reads a file                                 | No        |
| `list_dir`    | Lists a directory                            | No        |
| `glob`        | Finds files by pattern, e.g. `src/**/*.ts`   | No        |
| `grep`        | Searches text by regular expression          | No        |
| `find_code`   | Semantic search: "where is auth implemented" | No        |
| `edit_file`   | Changes part of a file                       | **Yes**   |
| `write_file`  | Creates or replaces a file                   | **Yes**   |
| `run_command` | Runs a shell command                         | **Yes**   |
| `todo_write`  | Keeps the plan                               | No        |

**Guards that are always on:**

- The agent cannot reach outside the project directory. Asking for
  `../../.ssh/id_rsa` is refused.
- Commands are killed on a timeout (two minutes) and when you press `Esc`.
- There is a step ceiling (25 by default) — it cannot loop forever.
- You can set a spending ceiling in dollars.
- A long conversation compacts itself before it overflows the model's window.

---

## 6. Approvals — the important part

When the agent wants to change a file or run a command, it stops:

```
Run this command?
npm install express

y allow once · a always in this project · n deny
```

| Key | What happens                                                     |
| --- | ---------------------------------------------------------------- |
| `y` | Allow this once                                                  |
| `a` | Stop asking about **this exact command** in **this** project     |
| `n` | Deny. The model is told you refused and will suggest another way |

Harmless commands like `git status`, `ls` and `node -v` never interrupt you —
being asked the same harmless question five times is how people learn to
approve without reading.

**Three modes** (change with `/permissions`):

| Mode        | Behaviour                                         |
| ----------- | ------------------------------------------------- |
| `ask`       | Default. Asks about edits and commands            |
| `auto-edit` | Edits files silently, still asks before commands  |
| `yolo`      | Asks about nothing. Only in a directory you trust |

---

## 7. Worked example: an app from nothing to release

A real path through a small web service.

### Step 1. Create the folder and start

```bash
mkdir todo-api && cd todo-api && git init
magnetar
```

### Step 2. Ask for a plan, not for code

```
/plan build a REST API for a task list on Node.js and Express,
SQLite for storage, with tests and a Dockerfile
```

`/plan` is a written-out prompt that makes the model think first and show you
the plan instead of diving into code. Read it and correct anything wrong.

### Step 3. Let it build

```
the plan is good, go ahead
```

It starts creating files, asking each time. Watch the first few carefully;
after that you can answer `a` to the ones that repeat.

Once you trust it, switch modes:

```
/permissions
```

Pick `auto-edit`. Files get written silently, but it will still ask before
`npm install`.

### Step 4. See what changed

```
/diff
```

Shows everything modified in the working tree — like `git diff`, without
leaving the session.

If it went somewhere wrong:

```
/undo
```

Restores **only the files the agent touched** in this session. Your own
uncommitted work is left alone.

### Step 5. Write tests

```
/test
```

Another written-out prompt: it demands coverage of boundaries, errors and empty
input, rather than tests that restate the code.

### Step 6. Run them

```
/run npm test
```

Or just say it in words: "run the tests and fix what fails." It will run them
itself and keep fixing until they pass.

### Step 7. Check security

```
/security
```

A structured audit: where untrusted input enters, where it ends up (shell, SQL,
file paths), authorisation on every entry point, and how secrets are stored.
It reports and changes nothing.

### Step 8. Tidy up

```
/simplify
```

Finds duplication, abstractions with a single caller, checks for states that
cannot happen — and fixes them.

```
/review
```

Reads the changes as a careful colleague: real bugs first, then, separately,
what could be simpler.

### Step 9. Record what it learned

```
/init
```

The analyst model reads the repository and writes `MAGNETAR.md` — how to build,
how to test, where things live, what the traps are. That file goes into every
later session, so the agent never has to work the project out again.

### Step 10. Commit

```
/commit
```

Reads the diff, groups unrelated changes into separate commits, and writes
messages that explain why rather than restating the diff. It will not push.

### Step 11. Docs and release

```
/docs
```

```
get this ready to publish: README, licence, a files field in package.json
```

Done.

---

## 8. Project memory

This is what separates an agent that knows your project from one that starts
from scratch every morning.

Three layers, all of which reach the system prompt:

**1. Your own rules** — `~/.magnetar/MAGNETAR.md`. Apply everywhere. Things
like "never add comments that restate the code".

**2. The project's rules** — `MAGNETAR.md` in the repository root. Build
commands, conventions, traps. Written by `/init`, edited by hand afterwards.
It lives in git, so the whole team shares one memory.

**3. Individual facts** — the `.magnetar/memory/` folder, one file each.

Record something without derailing what you are doing:

```
/btw the backend only deploys from main
```

```
/remember this project uses npm, never yarn
```

No model is called — the fact is written to a file and shows up in every later
session. To see what is stored:

```
/memory
```

To remove one:

```
/forget deploy-target
```

Because facts are plain files, they show up in `git diff` — you can always see
what the agent has been told.

---

## 9. The browser monitor

```bash
magnetar web
```

A page opens showing **the same session** as the terminal. It is not a second
chat; it is a window onto the work already happening.

What is there:

- **The live stream** — what the agent is writing right now.
- **Every tool call** — collapsed to one line, click to expand. Diffs are shown
  straight away, green and red.
- **The file tree** — changed files marked with a dot.
- **The plan** — as the agent revises it.
- **Memory** — readable and editable in place.
- **Sessions** — switch and delete.
- **Approvals** — the same three answers as the terminal.

The composer takes `/` for commands and `@` for project files; you can drag a
file in or attach one with `+`.

Your key never reaches the browser. Requests to the model are made by the
terminal process; the monitor only ever receives text. The server listens on
your machine only and requires a token, which is in the address bar.

---

## 10. Every command

Press `/` in a session for a scrolling list. Start typing to filter — it
matches names, aliases and descriptions, so `/key` finds `/provider`.

Commands come in two kinds. **Actions** Magnetar performs itself — instant and
free. **Prompt macros** are written-out instructions sent to the model.

### Session

| Command     | What it does                              | Example                                                        |
| ----------- | ----------------------------------------- | -------------------------------------------------------------- |
| `/new`      | Start a clean session                     | Finished a task — start fresh so old context stops interfering |
| `/sessions` | List past sessions and switch             | Go back to yesterday's work                                    |
| `/resume`   | Same                                      |                                                                |
| `/clear`    | Wipe the screen, keep the session         | Just clearing visual noise                                     |
| `/compact`  | Summarise a long conversation             | When `/context` says it is filling up                          |
| `/context`  | How full the model's window is            | A bar and a token count                                        |
| `/cost`     | What this session has spent               | `$0.0412`                                                      |
| `/export`   | Write the session to markdown             | A record of what the agent did                                 |
| `/rename`   | Rename the session                        | `/rename database refactor`                                    |
| `/fork`     | Copy the session and continue in the copy | Try another approach without losing this one                   |
| `/status`   | Provider, model, directory, mode          | A quick check                                                  |

### Provider and model

| Command        | What it does                    | Example                                 |
| -------------- | ------------------------------- | --------------------------------------- |
| `/provider`    | Add or switch service           | The full wizard, key included           |
| `/login`       | Same                            |                                         |
| `/model`       | Change model                    | Reach for a stronger one on a hard task |
| `/models`      | List every available model      |                                         |
| `/logout`      | Delete the stored key           |                                         |
| `/usage`       | Tokens and spend this session   |                                         |
| `/limits`      | Current step and money ceilings |                                         |
| `/temperature` | _Not supported yet_             | The provider's default is used          |

### Context

| Command          | What it does                      | Example                             |
| ---------------- | --------------------------------- | ----------------------------------- |
| `/add <path>`    | Attach a file to the conversation | `/add src/db.ts`                    |
| `/read <path>`   | Same                              |                                     |
| `/open <path>`   | Print a file in the terminal      | `/open package.json`                |
| `/search <text>` | Search the project                | `/search createUser`                |
| `/tree`          | Show the file tree                |                                     |
| `/files`         | What is in the current folder     |                                     |
| `/drop`          | _Placeholder_                     | To shed old context, use `/compact` |

### Memory

| Command            | What it does                                | Example                                   |
| ------------------ | ------------------------------------------- | ----------------------------------------- |
| `/init`            | Analyse the project and write `MAGNETAR.md` | The first thing to do in a new repository |
| `/memory`          | Show all memory currently in use            |                                           |
| `/memory-model`    | Choose the analyst model                    | Put something strong here                 |
| `/analyst`         | Same                                        |                                           |
| `/remember <fact>` | Record a fact                               | `/remember tests run with npm t`          |
| `/btw <note>`      | Note it in passing, without stopping        | `/btw production only from main`          |
| `/forget <name>`   | Delete a fact                               | `/forget deploy-target`                   |
| `/rules`           | Path to the project's `MAGNETAR.md`         | To open it in an editor                   |

### Code and git

| Command          | What it does                     | Example                             |
| ---------------- | -------------------------------- | ----------------------------------- |
| `/diff`          | What changed in the working tree |                                     |
| `/undo`          | Restore files the agent changed  | Through git, and only its own edits |
| `/branch`        | Show or switch branch            | `/branch feature/auth`              |
| `/build`         | Run `npm run build`              |                                     |
| `/lint`          | Run the linter                   |                                     |
| `/format`        | Run the formatter                |                                     |
| `/run <command>` | Run anything                     | `/run docker compose up -d`         |

### Prompt macros

This is where most of the value is. An answer is only as good as the prompt,
and nobody writes a careful one twice. These are already written.

| Command     | What it asks the model for                                                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/review`   | Review the changes as a careful colleague: real bugs first, with file and line, then separately what could be simpler. No praise, no restating the code  |
| `/security` | An audit in order: where untrusted input enters → where it is used → authorisation → secrets. Only reachable holes, not theoretical ones. Change nothing |
| `/explain`  | Explain the code to whoever has to maintain it: from the entry point along the real control flow, naming files                                           |
| `/refactor` | Rewrite without changing behaviour. Say what and why first. Every test stays green                                                                       |
| `/simplify` | Find needless complexity: duplication, single-caller abstractions, checks for impossible states. Fix them                                                |
| `/docs`     | Write documentation matching the style already in the repository                                                                                         |
| `/fix`      | Reproduce the failure, find the cause rather than the symptom, fix it, prove it by running                                                               |
| `/plan`     | Plan before writing code. Write nothing until agreed                                                                                                     |
| `/test`     | Write tests for what actually breaks: boundaries, empty input, errors                                                                                    |
| `/commit`   | Read the diff, split into meaningful commits, explain why. Do not push                                                                                   |

You can add detail to any macro:

```
/security pay particular attention to the file uploads
```

### System

| Command        | What it does                               |
| -------------- | ------------------------------------------ |
| `/help`        | Every command and key                      |
| `/tools`       | Which tools the model can call             |
| `/permissions` | Change the approval mode                   |
| `/web`         | Open the monitor in a browser              |
| `/doctor`      | Check the provider connection and settings |
| `/exit`        | Quit                                       |
| `/quit`        | Same                                       |

---

## 11. Scripts and CI

Magnetar can answer once and exit, with no interface.

**A simple question:**

```bash
magnetar -p "which routes does this app expose?"
```

**Feed it the output of something else:**

```bash
cat error.log | magnetar -p "why does this fail?"
```

```bash
npm test 2>&1 | magnetar -p "explain what broke"
```

**JSON out, for scripts:**

```bash
magnetar -p "check the types" --output-format json
```

You get an object with the answer, the session id, steps taken, tokens used and
the cost.

**Allow edits without prompting** — in a script nobody is there to press `y`:

```bash
magnetar -p "fix the linter" --permission-mode auto-edit
```

Without that, a tool needing approval is refused rather than left hanging.

---

## 12. Command-line flags

```
-p, --print <text>       answer once and exit
    --output-format      text or json
-m, --model <id>         a different model for this run only
-C, --cwd <dir>          work in another directory
-c, --continue           resume the most recent session here
-r, --resume <id>        resume a specific session
    --permission-mode    ask | auto-edit | yolo
    --max-steps <n>      stop after n steps (default 25)
    --max-cost <usd>     stop once a run costs this much
-h, --help               help
-v, --version            version
```

Sub-commands:

```bash
magnetar provider   # set up access
magnetar web        # open the monitor
magnetar doctor     # check the setup
```

---

## 13. When something breaks

**Start here:**

```bash
magnetar doctor
```

It checks the key, the connection and whether the chosen model exists, and says
which one is at fault.

| Problem                          | What to do                                        |
| -------------------------------- | ------------------------------------------------- |
| `command not found: magnetar`    | Reopen the terminal. Still broken — reinstall     |
| `No provider configured`         | Run `magnetar provider`                           |
| `401` from the provider          | Wrong or expired key. `/provider` again           |
| `404` from the provider          | Wrong base URL — it usually needs to end in `/v1` |
| The agent asks obvious questions | Weak model. Change it with `/model`               |
| It cannot find the right file    | Run `/init` so it records the project's memory    |
| The conversation got slow        | `/compact`                                        |
| It is stuck                      | `Esc`, then rephrase the task                     |

**Where things live:**

| Path                         | What it is                              |
| ---------------------------- | --------------------------------------- |
| `~/.magnetar/config.json`    | Settings and services. No keys here     |
| Your system keychain         | The API keys themselves                 |
| `~/.magnetar/projects/`      | Session history, one folder per project |
| `~/.magnetar/MAGNETAR.md`    | Your rules for every project            |
| `MAGNETAR.md` in a project   | That project's rules                    |
| `.magnetar/memory/`          | Facts about the project                 |
| `.magnetar/permissions.json` | Commands you answered "always" to       |
| `.magnetar/index.json`       | Search cache. Safe to delete            |

---

## The short version

```bash
npm i -g magnetar-code     # install
magnetar provider          # connect a model
cd my-project && magnetar  # work
/init                      # teach it the project
/                          # every command
magnetar web               # the browser monitor
```

Source and issues: [github.com/hamidkazimov777-cmd/Magnetar_Code](https://github.com/hamidkazimov777-cmd/Magnetar_Code)
