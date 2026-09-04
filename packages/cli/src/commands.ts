/** The registry lives in core so the terminal and the monitor offer the same
 *  commands. They drifted once already. */
export {
  COMMANDS,
  filterCommands,
  promptFor,
  resolveCommand,
  type SlashCommand,
} from "@magnetar/core";
