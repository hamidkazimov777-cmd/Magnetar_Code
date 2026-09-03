#!/usr/bin/env node

const blessed = require("blessed");
const chalk = require("chalk");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const fetch = require("node-fetch");
const { marked } = require("marked");
const { markedTerminal } = require("marked-terminal");

marked.use(markedTerminal({ width: 80 }));

const configDir = path.join(os.homedir(), ".magnetar");
const configFile = path.join(configDir, "cli-config.json");
const sessionsDir = path.join(configDir, "sessions");

function saveConfig(cfg) {
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  // Save global config
  const baseCfg = { provider: cfg.provider, currentSessionId: cfg.currentSessionId };
  fs.writeFileSync(configFile, JSON.stringify(baseCfg, null, 2));

  // Save session messages
  if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });
  const sessionFile = path.join(sessionsDir, `${cfg.currentSessionId}.json`);
  fs.writeFileSync(sessionFile, JSON.stringify(cfg.messages, null, 2));
}

let config = { messages: [], currentSessionId: "default" };
if (fs.existsSync(configFile)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(configFile, "utf8"));
    config.provider = parsed.provider;
    config.currentSessionId = parsed.currentSessionId || "default";
    if (parsed.messages) config.messages = parsed.messages; // Legacy support
  } catch (e) {}
}

if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });
const sessionFile = path.join(sessionsDir, `${config.currentSessionId}.json`);
if (fs.existsSync(sessionFile)) {
  try {
    config.messages = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
  } catch (e) {
    config.messages = [];
  }
} else if (config.messages.length > 0) {
  // Migrate legacy messages to the default session
  fs.writeFileSync(sessionFile, JSON.stringify(config.messages, null, 2));
}

if (process.argv[2] === "provider" || process.argv[2] === "--provider") {
  console.clear();
  console.log(chalk.cyan("\nНастройка провайдера Magnetar (BYOK)..."));
  const inquirer = require("inquirer");

  (async () => {
    const answers1 = await inquirer.prompt([
      { type: "input", name: "name", message: "Название:", default: "OpenAI" },
      {
        type: "input",
        name: "baseUrl",
        message: "Base URL:",
        default: "https://api.openai.com/v1",
      },
      { type: "password", name: "apiKey", message: "API Key:", mask: "*" },
    ]);

    let models = ["gpt-4o-mini", "deepseek-v4-pro", "deepseek-v4-flash", "gpt-4o"]; // fallback
    try {
      let url = answers1.baseUrl.trim();
      if (!url.startsWith("http")) url = "https://" + url;
      if (url.endsWith("/")) url = url.slice(0, -1);
      answers1.baseUrl = url;

      console.log(chalk.gray(`Загрузка списка моделей из ${url}/models ...`));
      const res = await fetch(`${url}/models`, {
        headers: { Authorization: `Bearer ${answers1.apiKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        let modelsArray = [];
        if (Array.isArray(data)) modelsArray = data;
        else if (data.data && Array.isArray(data.data)) modelsArray = data.data;
        else if (data.models && Array.isArray(data.models)) modelsArray = data.models;

        if (modelsArray.length > 0) {
          models = modelsArray.map((m) =>
            typeof m === "string" ? m : m.id || m.name || m.model || JSON.stringify(m),
          );
        } else {
          console.log(chalk.yellow("Сервер вернул пустой список моделей."));
        }
      }
    } catch (e) {
      console.log(chalk.red(`Сетевая ошибка: ${e.message}. Используем стандартный список.`));
    }

    const answers2 = await inquirer.prompt([
      { type: "list", name: "model", message: "Выберите модель:", choices: models, pageSize: 10 },
    ]);

    config.provider = { ...answers1, ...answers2 };
    saveConfig(config);

    console.log(chalk.green("\n✓ Провайдер успешно сохранён!"));
    console.log(chalk.yellow("Теперь запустите команду: magnetar\n"));
    process.exit(0);
  })();
  return;
}

if (!config.messages) config.messages = [];

const screen = blessed.screen({
  smartCSR: true,
  title: "Magnetar Code",
});

const modelName = config.provider ? config.provider.model : "none";
const version = require("./package.json").version;

const topBox = blessed.box({
  top: 0,
  left: 0,
  width: "100%",
  height: 8,
  content: `{blue-fg}{bold} Welcome to Magnetar Code!{/}\n Send /help for help information.\n\n Directory: ${process.cwd()}\n Session:   ${config.currentSessionId}\n Model:     ${modelName}\n Version:   ${version}`,
  tags: true,
  border: { type: "line" },
  style: { border: { fg: "#4b5563" } }, // gray border
});

const logBox = blessed.log({
  top: 8,
  left: 0,
  width: "100%",
  bottom: 4,
  tags: true,
  scrollable: true,
  alwaysScroll: true,
  mouse: true,
  keys: true,
  scrollbar: {
    ch: " ",
    inverse: true,
  },
});

// Override blessed's default half-screen jump on mouse wheel
logBox.removeAllListeners("wheeldown");
logBox.removeAllListeners("wheelup");

logBox.on("wheeldown", () => {
  logBox.scroll(2); // Scroll 2 lines down smoothly
  screen.render();
});

logBox.on("wheelup", () => {
  logBox.scroll(-2); // Scroll 2 lines up smoothly
  screen.render();
});

const inputWrapper = blessed.box({
  bottom: 1,
  left: 0,
  width: "100%",
  height: 3,
  border: { type: "line" },
  style: { border: { fg: "#4b5563" } },
});

const inputPrompt = blessed.text({
  top: 0,
  left: 0,
  content: "> ",
  style: { fg: "white" },
});

const inputBox = blessed.textbox({
  top: 0,
  left: 2,
  width: "100%-4",
  height: 1,
  keys: true,
  inputOnFocus: true,
  style: { fg: "white" },
});

inputWrapper.append(inputPrompt);
inputWrapper.append(inputBox);

const statusBar = blessed.box({
  bottom: 0,
  left: 0,
  width: "100%",
  height: 1,
  content: `{yellow-fg}Ask When Needed{/}   ${modelName} thinking  ~`,
  tags: true,
});

const commands = [
  { cmd: "/provider", desc: "Настроить ИИ-провайдера (BYOK)" },
  { cmd: "/web", desc: "Открыть Web UI версию" },
  { cmd: "/read", desc: "Прикрепить файл к контексту (/read <file>)" },
  { cmd: "/new", desc: "Создать новую сессию (чат)" },
  { cmd: "/sessions", desc: "Переключиться между сохраненными сессиями" },
  { cmd: "/clear", desc: "Очистить контекст текущего чата" },
  { cmd: "/exit", desc: "Выйти" },
];

const cmdPopup = blessed.list({
  bottom: 4,
  left: 0,
  width: "100%",
  height: 6,
  items: commands.map((c) => ` ${c.cmd.padEnd(12)} - ${c.desc}`),
  style: {
    selected: { bg: "blue", fg: "white" },
    item: { fg: "white" },
  },
  border: { type: "line", fg: "#4b5563" },
  hidden: true,
  interactive: true,
  keys: false,
  mouse: false,
});

Object.defineProperty(cmdPopup, "focused", { get: () => true });

screen.append(topBox);
screen.append(logBox);
screen.append(inputWrapper);
screen.append(statusBar);
screen.append(cmdPopup);

logBox.log(
  "{blue-fg}+ Try Magnetar Web UI - clearer task progress, visual sessions & settings management{/}",
);
logBox.log("Run /web to continue your session in the browser\n");

if (!config.provider) {
  logBox.log("{yellow-fg}No provider configured yet. Run /provider to setup.{/}");
}

let isProcessing = false;

function updateStatus(text) {
  statusBar.setContent(`{yellow-fg}Ask When Needed{/}   ${text}`);
  screen.render();
}

async function handleCommand(text) {
  const input = text.trim();
  if (!input) return;

  logBox.log(`> ${input}`);

  if (input === "/exit" || input === "/quit") {
    return process.exit(0);
  }

  if (input.startsWith("/read ")) {
    const filePath = input.slice(6).trim();
    try {
      const absPath = path.resolve(process.cwd(), filePath);
      if (fs.existsSync(absPath)) {
        const content = fs.readFileSync(absPath, "utf8");
        const msg = `[Attached File: ${path.basename(absPath)}]\n\`\`\`\n${content}\n\`\`\``;

        // Add to history but don't query AI yet
        config.messages.push({ role: "user", content: msg });
        saveConfig(config);

        logBox.log(`{green-fg}File ${path.basename(absPath)} attached to context!{/}`);
      } else {
        logBox.log(`{red-fg}File not found: ${absPath}{/}`);
      }
    } catch (e) {
      logBox.log(`{red-fg}Error reading file: ${e.message}{/}`);
    }
    return;
  }

  if (input === "/clear") {
    config.messages = [];
    saveConfig(config);
    logBox.log("{green-fg}Session cleared.{/}");
    return;
  }

  if (input === "/new") {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    config.currentSessionId = `session-${timestamp}`;
    config.messages = [];
    saveConfig(config);
    logBox.setContent("");
    logBox.log(`{green-fg}Started a new session: ${config.currentSessionId}{/}`);
    topBox.setContent(
      `{blue-fg}{bold} Welcome to Magnetar Code!{/}\n Send /help for help information.\n\n Directory: ${process.cwd()}\n Session:   ${config.currentSessionId}\n Model:     ${modelName}\n Version:   ${version}`,
    );
    screen.render();
    return;
  }

  if (input === "/sessions") {
    const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith(".json"));
    if (files.length === 0) {
      logBox.log("{yellow-fg}No sessions found.{/}");
      return;
    }

    // Create a temporary blessed list to select session
    const sessionList = blessed.list({
      parent: screen,
      top: "center",
      left: "center",
      width: "50%",
      height: "50%",
      border: "line",
      label: " {blue-fg}Select Session{/} ",
      tags: true,
      keys: true,
      mouse: true,
      vi: true,
      interactive: true,
      style: {
        border: { fg: "cyan" },
        selected: { bg: "blue", fg: "white", bold: true },
      },
      items: files.map((f) => f.replace(".json", "")),
    });

    sessionList.focus();
    screen.render();

    sessionList.on("select", (item) => {
      const selectedId = item.getText();
      sessionList.destroy();

      config.currentSessionId = selectedId;
      try {
        config.messages = JSON.parse(
          fs.readFileSync(path.join(sessionsDir, `${selectedId}.json`), "utf8"),
        );
      } catch (e) {
        config.messages = [];
      }
      saveConfig(config);

      logBox.setContent("");
      for (const msg of config.messages) {
        if (msg.role === "user") logBox.log(`{magenta-fg}You:{/}\n${msg.content}`);
        else if (msg.role === "assistant") logBox.log(`{cyan-fg}Magnetar:{/}\n${msg.content}`);
      }
      logBox.log(`{green-fg}Switched to session: ${selectedId}{/}`);
      topBox.setContent(
        `{blue-fg}{bold} Welcome to Magnetar Code!{/}\n Send /help for help information.\n\n Directory: ${process.cwd()}\n Session:   ${config.currentSessionId}\n Model:     ${modelName}\n Version:   ${version}`,
      );

      inputBox.focus();
      screen.render();
    });

    sessionList.key(["escape", "q", "C-c"], () => {
      sessionList.destroy();
      inputBox.focus();
      screen.render();
    });
    return;
  }

  if (input === "/provider") {
    screen.destroy();
    console.clear();
    console.log(chalk.cyan("Пожалуйста, выполните следующую команду в терминале:"));
    console.log(chalk.yellow("  magnetar provider\n"));
    process.exit(0);
  }

  if (input === "/web" || input === "/magnetarweb") {
    logBox.log("{green-fg}Launching Magnetar Web UI...{/}");

    const webUiPath = path.join(__dirname, "..", "Magnetar-Web-UI");
    const nextCmd = process.platform === "win32" ? "npm.cmd" : "npm";

    const child = spawn(nextCmd, ["run", "dev"], {
      cwd: webUiPath,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });

    let browserOpened = false;

    child.stdout.on("data", async (data) => {
      const output = data.toString();
      if (
        !browserOpened &&
        (output.includes("Ready") || output.includes("Local:") || output.includes("ready in"))
      ) {
        browserOpened = true;
        logBox.log("{cyan-fg}Web UI is running on http://localhost:3000{/}");

        try {
          const open = (await import("open")).default;
          await open("http://localhost:3000");
        } catch (err) {}
      }
    });

    child.on("exit", () => {
      logBox.log("{yellow-fg}Web UI server stopped.{/}");
    });

    return;
  }

  if (!config.provider) {
    logBox.log("{red-fg}Provider not configured. Edit ~/.magnetar/cli-config.json{/}");
    return;
  }

  isProcessing = true;
  updateStatus("generating response...");
  config.messages.push({ role: "user", content: input });

  await runInference();
}

async function runInference() {
  const { tools, executeTool } = require("./tools");
  try {
    const response = await fetch(`${config.provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.provider.apiKey}`,
      },
      body: JSON.stringify({
        model: config.provider.model,
        messages: config.messages,
        stream: true,
        tools: tools,
      }),
    });

    if (!response.ok) {
      logBox.log(`{red-fg}API Error: ${response.status} ${response.statusText}{/}`);
      config.messages.pop();
    } else {
      let reply = "";
      let toolCalls = {};
      const baseContent = logBox.getContent() + `\n{magenta-fg}Magnetar:{/}\n`;

      const { marked } = require("marked");
      const { markedTerminal } = require("marked-terminal");
      marked.use(markedTerminal({ width: logBox.width - 4 }));

      const decoder = new (require("util").TextDecoder)("utf-8");
      let buffer = "";

      if (response.body) {
        for await (const chunk of response.body) {
          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop();

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith("data: ") && trimmedLine !== "data: [DONE]") {
              try {
                const parsed = JSON.parse(trimmedLine.slice(6));
                const delta = parsed.choices[0]?.delta || {};

                if (delta.content) {
                  reply += delta.content;
                  logBox.setContent(baseContent + marked(reply + "█"));
                  logBox.setScrollPerc(100);
                  screen.render();
                }

                if (delta.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    if (!toolCalls[tc.index]) {
                      toolCalls[tc.index] = {
                        id: tc.id,
                        type: "function",
                        function: { name: "", arguments: "" },
                      };
                    }
                    if (tc.id) toolCalls[tc.index].id = tc.id;
                    if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name;
                    if (tc.function?.arguments)
                      toolCalls[tc.index].function.arguments += tc.function.arguments;
                  }
                }
              } catch (e) {}
            }
          }
        }
      }

      const toolsList = Object.values(toolCalls);

      if (toolsList.length > 0) {
        logBox.setContent(baseContent + marked(reply));
        config.messages.push({ role: "assistant", content: reply || null, tool_calls: toolsList });

        for (const tc of toolsList) {
          const fnName = tc.function.name;
          const fnArgs = JSON.parse(tc.function.arguments || "{}");

          let allowed = true;
          if (
            fnName === "run_terminal_command" ||
            fnName === "write_to_file" ||
            fnName === "replace_in_file"
          ) {
            allowed = await new Promise((resolve) => {
              const box = blessed.box({
                parent: screen,
                top: "center",
                left: "center",
                width: "60%",
                height: 7,
                border: "line",
                tags: true,
                style: { border: { fg: "yellow" } },
                content: `{yellow-fg}{bold}Security Check (Ask When Needed){/}\n\nAI wants to run: {cyan-fg}${fnName}{/}\nTarget: ${fnArgs.command || fnArgs.file_path || ""}\n\nPress {green-fg}Y{/} to allow, {red-fg}N{/} to deny.`,
              });
              box.focus();
              screen.render();

              box.on("keypress", (ch, key) => {
                if (ch === "y" || ch === "Y") {
                  box.destroy();
                  resolve(true);
                } else if (ch === "n" || ch === "N" || key.name === "escape") {
                  box.destroy();
                  resolve(false);
                }
              });
            });
            inputBox.focus();
            screen.render();
          }

          let result;
          if (allowed) {
            updateStatus(`running tool ${fnName}...`);
            logBox.log(
              `{yellow-fg}[Tool] Executing ${fnName}: ${fnArgs.command || fnArgs.file_path || ""}{/}`,
            );
            screen.render();
            result = await executeTool(fnName, fnArgs);
          } else {
            result =
              "User denied the execution of this tool. Do not try to run it again, explain to the user why you need it or propose an alternative.";
            logBox.log(`{red-fg}[Tool] Denied execution of ${fnName}{/}`);
            screen.render();
          }

          logBox.log(`{gray-fg}[Tool] Result: ${result.slice(0, 100).replace(/\n/g, " ")}...{/}`);
          screen.render();

          config.messages.push({
            role: "tool",
            tool_call_id: tc.id,
            name: fnName,
            content: result,
          });
        }

        // Recursively let AI respond to tool output
        updateStatus("generating response...");
        await runInference();
        return; // Important to stop the current execution context
      }

      logBox.setContent(baseContent + marked(reply));
      logBox.setScrollPerc(100);
      screen.render();

      config.messages.push({ role: "assistant", content: reply });
      saveConfig(config);
    }
  } catch (err) {
    logBox.log(`{red-fg}Network Error: ${err.message}{/}`);
    config.messages.pop();
  }

  isProcessing = false;
  updateStatus("ready  ~");
  screen.render();
}

let popupVisible = false;

inputBox.key(["up"], (ch, key) => {
  if (popupVisible) {
    cmdPopup.up(1);
    screen.render();
    return false; // prevent default
  }
});

inputBox.key(["down"], (ch, key) => {
  if (popupVisible) {
    cmdPopup.down(1);
    screen.render();
    return false; // prevent default
  }
});

inputBox.key(["pageup"], (ch, key) => {
  logBox.scroll(-Math.max(1, Math.floor(logBox.height / 2)));
  screen.render();
});

inputBox.key(["pagedown"], (ch, key) => {
  logBox.scroll(Math.max(1, Math.floor(logBox.height / 2)));
  screen.render();
});

inputBox.on("keypress", (ch, key) => {
  if (key && (key.name === "up" || key.name === "down")) {
    return;
  }

  process.nextTick(() => {
    const val = inputBox.value;
    if (val.startsWith("/")) {
      if (!popupVisible) {
        popupVisible = true;
        cmdPopup.show();
        screen.render();
      }
    } else {
      if (popupVisible) {
        popupVisible = false;
        cmdPopup.hide();
        screen.render();
      }
    }
  });
});

inputBox.on("submit", async (text) => {
  let commandToRun = text;

  if (popupVisible) {
    const idx = cmdPopup.selected;
    commandToRun = commands[idx].cmd;
    popupVisible = false;
    cmdPopup.hide();
  }

  inputBox.clearValue();
  screen.render();

  if (isProcessing) return;
  await handleCommand(commandToRun);

  inputBox.focus();
  screen.render();
});

screen.key(["escape", "C-c"], function (ch, key) {
  return process.exit(0);
});

inputBox.focus();
updateStatus("ready  ~");
screen.render();
