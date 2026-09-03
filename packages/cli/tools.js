const { exec } = require("child_process");
const util = require("util");
const fs = require("fs");
const path = require("path");
const execAsync = util.promisify(exec);

const tools = [
  {
    type: "function",
    function: {
      name: "run_terminal_command",
      description:
        "Run a shell command on the user's macOS terminal. Use this to list directories, run tests, or execute scripts.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The bash command to execute" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the exact contents of a file.",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Path to the file" },
        },
        required: ["file_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_to_file",
      description: "Create a new file or overwrite an existing file completely with new content.",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string" },
          content: { type: "string", description: "The complete content to write" },
        },
        required: ["file_path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "replace_in_file",
      description:
        "Edit an existing file by replacing a specific block of text. old_text must match exactly.",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string" },
          old_text: { type: "string", description: "Exact text to find and replace" },
          new_text: { type: "string", description: "The new text to insert" },
        },
        required: ["file_path", "old_text", "new_text"],
      },
    },
  },
];

async function executeTool(name, args) {
  try {
    if (name === "run_terminal_command") {
      const { stdout, stderr } = await execAsync(args.command);
      return stdout + (stderr ? "\nSTDERR:\n" + stderr : "");
    }

    if (name === "read_file") {
      const absPath = path.resolve(process.cwd(), args.file_path);
      if (!fs.existsSync(absPath)) return `Error: File not found - ${absPath}`;
      return fs.readFileSync(absPath, "utf8");
    }

    if (name === "write_to_file") {
      const absPath = path.resolve(process.cwd(), args.file_path);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, args.content, "utf8");
      return `Success: File written to ${absPath}`;
    }

    if (name === "replace_in_file") {
      const absPath = path.resolve(process.cwd(), args.file_path);
      if (!fs.existsSync(absPath)) return `Error: File not found - ${absPath}`;
      let content = fs.readFileSync(absPath, "utf8");
      if (!content.includes(args.old_text)) {
        return `Error: old_text not found in file exactly as provided. Check whitespace/indentation.`;
      }
      content = content.replace(args.old_text, args.new_text);
      fs.writeFileSync(absPath, content, "utf8");
      return `Success: Replaced text in ${absPath}`;
    }

    return `Unknown tool: ${name}`;
  } catch (e) {
    return `Error executing tool ${name}: ${e.message}`;
  }
}

module.exports = { tools, executeTool };
