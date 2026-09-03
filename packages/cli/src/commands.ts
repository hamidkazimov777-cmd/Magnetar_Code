export interface SlashCommand {
  name: string;
  description: string;
  /** Extra text the command accepts, shown in the palette. */
  argument?: string;
  aliases?: string[];
}

export const COMMANDS: SlashCommand[] = [
  { name: "/help", description: "Show commands and keys" },
  { name: "/provider", description: "Set the API key or switch provider", aliases: ["/login"] },
  { name: "/model", description: "Pick the model for this session" },
  { name: "/new", description: "Start a fresh session" },
  { name: "/sessions", description: "Switch to an earlier session", aliases: ["/resume"] },
  {
    name: "/add",
    description: "Attach a file to the context",
    argument: "<path>",
    aliases: ["/read"],
  },
  { name: "/diff", description: "Show what changed in the working tree" },
  { name: "/undo", description: "Revert the files this session changed" },
  { name: "/cost", description: "Tokens and spend for this session" },
  { name: "/context", description: "How full the context window is" },
  { name: "/compact", description: "Summarise the transcript to free context" },
  { name: "/clear", description: "Clear the transcript, keep the session" },
  { name: "/init", description: "Write a MAGNETAR.md for this project" },
  { name: "/memory", description: "Show the project instructions in use" },
  { name: "/permissions", description: "Change the approval mode" },
  { name: "/tools", description: "List the tools the model can call" },
  { name: "/export", description: "Write this session to a markdown file" },
  { name: "/web", description: "Open the web monitor" },
  { name: "/doctor", description: "Check the setup" },
  { name: "/exit", description: "Quit", aliases: ["/quit"] },
];

/** Resolve what the user typed to a command, honouring aliases. */
export function resolveCommand(input: string): { command: SlashCommand; argument: string } | null {
  const [word = "", ...rest] = input.trim().split(/\s+/);
  const command = COMMANDS.find((c) => c.name === word || c.aliases?.includes(word));
  return command ? { command, argument: rest.join(" ") } : null;
}

/** Palette matches on the name and the description, so "/key" finds
 *  "/provider — Add or switch API provider" too. */
export function filterCommands(input: string): SlashCommand[] {
  if (!input.startsWith("/")) return [];
  const query = input.slice(1).trim().toLowerCase();
  if (!query) return COMMANDS;
  const byName = COMMANDS.filter((c) => c.name.slice(1).startsWith(query));
  const byAlias = COMMANDS.filter(
    (c) => !byName.includes(c) && c.aliases?.some((a) => a.slice(1).startsWith(query)),
  );
  const byText = COMMANDS.filter(
    (c) =>
      !byName.includes(c) && !byAlias.includes(c) && c.description.toLowerCase().includes(query),
  );
  return [...byName, ...byAlias, ...byText];
}
