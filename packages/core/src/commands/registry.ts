export type CommandGroup =
  "session" | "provider" | "context" | "memory" | "code" | "prompt" | "system";

export interface SlashCommand {
  name: string;
  description: string;
  group: CommandGroup;
  /** "action" is handled by code; "prompt" expands into a canned instruction
   *  and is sent to the model. Macros are where most of the value is: the
   *  quality of an answer is set by the prompt, and nobody types a good one
   *  twice. */
  kind: "action" | "prompt";
  argument?: string;
  aliases?: string[];
}

/** Prompt macros. Each is deliberately specific about order, output and what
 *  not to do — a vague macro is worse than no macro, because it looks like the
 *  tool has an opinion when it does not. */
export const PROMPTS: Record<string, string> = {
  "/review": `Review the current changes as a careful colleague would.
Read the diff first (git diff, and git diff --staged), then read enough of the
surrounding code to judge each change in context.
Report only real problems, most serious first: correctness bugs, unhandled
errors, race conditions, security issues, and changes that break an existing
caller. For each: the file and line, what breaks, and the input or state that
triggers it.
Then, separately and briefly, note anything that could be simpler.
Do not restate what the code does, do not praise it, and do not comment on
formatting.`,

  "/security": `Audit this project for security problems that are actually
reachable, not theoretical ones.
Work in this order: find where untrusted input enters (network, files,
arguments, environment); follow it to where it is used (shell, SQL, filesystem
paths, deserialisation, templating); check authentication and authorisation on
every entry point; then check how secrets are stored and logged.
Use grep and read the files — do not guess from names.
For each finding: the file and line, the attack, and the smallest fix. If you
find nothing exploitable, say so plainly instead of padding the list.
Do not change any code.`,

  "/explain": `Explain how this code works to someone who has to maintain it.
Start from the entry point and follow the real control flow. Name the files and
functions as you go. Cover the data that moves between them and the invariants
that are assumed but not enforced.
Be concrete about this codebase; skip general programming background.`,

  "/refactor": `Refactor the code we are discussing without changing what it
does.
First state what you are going to change and why it is better. Then make the
change. Keep every existing test passing and every public signature working
unless I said otherwise.
Prefer removing code over adding abstraction. If the honest answer is that the
code is fine as it is, say that and stop.`,

  "/simplify": `Find code here that is more complicated than the problem
requires.
Look for: duplicated logic that wants one function, abstractions with a single
caller, options nobody passes, defensive checks for states that cannot happen,
and hand-rolled code the standard library already provides.
Apply the changes. Do not hunt for bugs — that is a different job — and do not
reformat anything.`,

  "/docs": `Write or update documentation for what we just built.
Cover what it is for, how to use it, and the decisions a reader would otherwise
have to reverse-engineer. Match the tone and structure of the existing docs in
this repository.
No marketing language, no restating type signatures in prose.`,

  "/fix": `Fix the failing test or error.
Reproduce it first — run the test or the command and read the actual output.
Find the cause rather than the symptom, then make the smallest change that
fixes the cause. Run it again to prove it.
If the test itself is wrong, say so and explain why before changing it.`,

  "/plan": `Plan this work before writing any code.
Read the parts of the codebase this will touch. Then lay out the steps in
order, what each one changes, what could go wrong, and what you are unsure
about. Flag anything that needs a decision from me.
Write no code until I agree.`,

  "/test": `Write tests for the code we are working on.
Cover the behaviour that matters and the cases that actually break things:
boundaries, empty input, errors, concurrency. Match the existing test style in
this repository.
Do not test implementation details or write tests that only restate the code.
Run them when you are done and show the result.`,

  "/commit": `Commit the current changes.
Read the diff first. Group unrelated changes into separate commits. Write
messages that explain why the change was made, not what the diff already shows;
first line under 72 characters, imperative mood.
Do not push unless I ask.`,
};

const C = (
  name: string,
  description: string,
  group: CommandGroup,
  extra: Partial<SlashCommand> = {},
): SlashCommand => ({ name, description, group, kind: "action", ...extra });

export const COMMANDS: SlashCommand[] = [
  // session
  C("/new", "Start a fresh session", "session"),
  C("/sessions", "Switch to an earlier session", "session", { aliases: ["/resume"] }),
  C("/clear", "Clear the transcript, keep the session", "session"),
  C("/compact", "Summarise the transcript to free context", "session"),
  C("/context", "How full the context window is", "session"),
  C("/cost", "Tokens and spend for this session", "session"),
  C("/export", "Write this session to a markdown file", "session"),
  C("/rename", "Rename this session", "session", { argument: "<title>" }),
  C("/fork", "Copy this session and continue in the copy", "session"),
  C("/status", "Model, directory, branch and mode at a glance", "session"),

  // provider
  C("/provider", "Set the API key or switch provider", "provider", { aliases: ["/login"] }),
  C("/model", "Pick the model for this session", "provider"),
  C("/models", "List the models this provider offers", "provider"),
  C("/logout", "Forget the stored API key", "provider"),
  C("/usage", "Token usage for this session", "provider"),
  C("/limits", "Step and cost ceilings for this run", "provider"),
  C("/temperature", "Set sampling temperature", "provider", { argument: "<0-2>" }),

  // context
  C("/add", "Attach a file to the context", "context", { argument: "<path>", aliases: ["/read"] }),
  C("/drop", "Remove an attached file from the context", "context", { argument: "<path>" }),
  C("/files", "List files the agent has touched", "context"),
  C("/tree", "Show the project tree", "context"),
  C("/open", "Print a file", "context", { argument: "<path>" }),
  C("/search", "Search the project", "context", { argument: "<pattern>" }),

  // memory
  C("/init", "Analyse the project and write MAGNETAR.md", "memory"),
  C("/memory", "Show the project instructions in use", "memory"),
  C("/remember", "Save a fact about this project", "memory", { argument: "<fact>" }),
  C("/btw", "Note something in passing, without interrupting", "memory", { argument: "<note>" }),
  C("/forget", "Delete a remembered fact", "memory", { argument: "<name>" }),
  C("/rules", "Edit the project's MAGNETAR.md", "memory"),

  // code
  C("/diff", "Show what changed in the working tree", "code"),
  C("/undo", "Revert the files this session changed", "code"),
  C("/branch", "Show or switch git branch", "code", { argument: "[name]" }),
  C("/build", "Run the project's build", "code"),
  C("/lint", "Run the linter", "code"),
  C("/format", "Run the formatter", "code"),
  C("/run", "Run a shell command", "code", { argument: "<command>" }),

  // prompt macros
  C("/review", "Review the current changes", "prompt", { kind: "prompt" }),
  C("/security", "Audit the project for security problems", "prompt", { kind: "prompt" }),
  C("/explain", "Explain how this code works", "prompt", { kind: "prompt" }),
  C("/refactor", "Refactor without changing behaviour", "prompt", { kind: "prompt" }),
  C("/simplify", "Cut needless complexity", "prompt", { kind: "prompt" }),
  C("/docs", "Write documentation for what we built", "prompt", { kind: "prompt" }),
  C("/fix", "Reproduce and fix the failure", "prompt", { kind: "prompt" }),
  C("/plan", "Plan the work before writing code", "prompt", { kind: "prompt" }),
  C("/test", "Write tests for this code", "prompt", { kind: "prompt" }),
  C("/commit", "Commit the current changes", "prompt", { kind: "prompt" }),

  // system
  C("/help", "Show commands and keys", "system"),
  C("/tools", "List the tools the model can call", "system"),
  C("/permissions", "Change the approval mode", "system"),
  C("/web", "Open the monitor in a browser", "system"),
  C("/doctor", "Check the setup", "system"),
  C("/exit", "Quit", "system", { aliases: ["/quit"] }),
];

export function resolveCommand(input: string): { command: SlashCommand; argument: string } | null {
  const [word = "", ...rest] = input.trim().split(/\s+/);
  const command = COMMANDS.find((c) => c.name === word || c.aliases?.includes(word));
  return command ? { command, argument: rest.join(" ") } : null;
}

/** Matches on the name, then aliases, then the description — so "/key" finds
 *  /provider. Ordering matters more than completeness here: the palette shows
 *  a handful of rows, and the first one should be the obvious answer. */
export function filterCommands(input: string): SlashCommand[] {
  if (!input.startsWith("/")) return [];
  const query = input.slice(1).trim().toLowerCase();
  if (!query) return COMMANDS;
  // Shortest name first: typing "/co" means /cost more often than /compact.
  const byName = COMMANDS.filter((c) => c.name.slice(1).startsWith(query)).sort(
    (a, b) => a.name.length - b.name.length,
  );
  const byAlias = COMMANDS.filter(
    (c) => !byName.includes(c) && c.aliases?.some((a) => a.slice(1).startsWith(query)),
  );
  const byText = COMMANDS.filter(
    (c) =>
      !byName.includes(c) &&
      !byAlias.includes(c) &&
      (c.description.toLowerCase().includes(query) || c.group.includes(query)),
  );
  return [...byName, ...byAlias, ...byText];
}

export function promptFor(name: string): string | null {
  return PROMPTS[name] ?? null;
}
