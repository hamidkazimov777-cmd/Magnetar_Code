# Security

Magnetar Code runs shell commands and edits files on your machine. That is the
point of it, and it is also the risk. This is what the program does about it.

## The approval boundary

Read-only tools (`read_file`, `list_dir`, `glob`, `grep`) run without asking.
Everything that can change your machine — `write_file`, `edit_file`,
`run_command` — needs your approval first, in the default `ask` mode.

A short allowlist of inspection commands (`git status`, `ls`, `node --version`
and similar) runs without a prompt, because being asked about `git status` for
the fifth time is how people learn to approve without reading. A command
containing shell metacharacters is never on that list: `ls` being safe says
nothing about `ls; rm -rf .`.

Answering "always" records the decision in `.magnetar/permissions.json` in that
project only. Trusting `npm test` in your own repository says nothing about
trusting it in one you just cloned.

`--permission-mode auto-edit` allows file writes without asking but still
prompts for commands. `--permission-mode yolo`, also spelled
`--dangerously-skip-permissions`, asks for nothing. Do not use it in a
directory whose contents you have not read.

## Boundaries the tools enforce

- Every path a tool touches is resolved inside the project directory. A path
  that escapes it is refused, including through symlinked parents and `..`.
- `run_command` has a timeout, a cap on captured output, and is killed as a
  process group when a turn is cancelled.
- `read_file` refuses binaries and files over 256 KB.

## Keys

API keys go to the system keychain (`security` on macOS, `secret-tool` on
Linux). Where no keychain is available they fall back to
`~/.magnetar/secrets.json` with owner-only permissions, and the CLI tells you
which happened. `~/.magnetar/config.json` holds endpoints and never secrets.

Requests to your provider are made by the Node process. No key is ever sent to
the browser.

## The local daemon

`magnetar web` starts an HTTP server bound to `127.0.0.1` with a token
generated for that run. Every request must carry it; it is compared in constant
time. Requests arriving with a foreign `Origin` are refused, and no CORS
headers are sent, so a page on another site can neither read a response nor
cause an effect — being on localhost is not a security property, and a page on
any site can reach localhost.

Memory endpoints accept writes only to the three files memory lives in. Any
other path would be a way around the approval every other write goes through.

## Prompt injection

A model reads files, command output and anything else you point it at. Treat
that content as data, never as instructions — and remember that the approval
prompt is what stands between a sentence in a README and a command running on
your machine. Read what you are approving.

## Reporting a problem

Open an issue at
https://github.com/hamidkazimov777-cmd/Magnetar_Code/issues, or, for
something you would rather not post publicly, contact the author directly.
