import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { Picker } from "./Picker.js";
import { Approval } from "./Approval.js";
import { TextInput } from "./TextInput.js";
import { Transcript } from "./Transcript.js";
import type { ApprovalRequest } from "@magnetar/core";

const ESC = "\u001B";
const ARROW_DOWN = `${ESC}[B`;
const ARROW_UP = `${ESC}[A`;
const ENTER = "\r";

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("Picker", () => {
  const items = [
    { value: "a", label: "alpha" },
    { value: "b", label: "beta" },
    { value: "c", label: "gamma" },
  ];

  it("selects the highlighted item", async () => {
    const onSelect = vi.fn();
    const { stdin } = render(
      <Picker title="Pick" items={items} onSelect={onSelect} onCancel={vi.fn()} />,
    );
    await tick();
    stdin.write(ARROW_DOWN);
    await tick();
    stdin.write(ENTER);
    await tick();
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("wraps around at the ends", async () => {
    const onSelect = vi.fn();
    const { stdin } = render(
      <Picker title="Pick" items={items} onSelect={onSelect} onCancel={vi.fn()} />,
    );
    await tick();
    stdin.write(ARROW_UP);
    await tick();
    stdin.write(ENTER);
    await tick();
    expect(onSelect).toHaveBeenCalledWith("c");
  });

  it("filters as you type", async () => {
    const onSelect = vi.fn();
    const { stdin, lastFrame } = render(
      <Picker title="Pick" items={items} onSelect={onSelect} onCancel={vi.fn()} />,
    );
    await tick();
    stdin.write("gam");
    await tick();
    expect(lastFrame()).toContain("gamma");
    expect(lastFrame()).not.toContain("alpha");
    stdin.write(ENTER);
    await tick();
    expect(onSelect).toHaveBeenCalledWith("c");
  });

  it("cancels on escape", async () => {
    const onCancel = vi.fn();
    const { stdin } = render(
      <Picker title="Pick" items={items} onSelect={vi.fn()} onCancel={onCancel} />,
    );
    await tick();
    stdin.write(ESC);
    await tick();
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("Approval", () => {
  const request = {
    tool: { name: "run_command" },
    args: { command: "rm -rf build" },
    summary: "rm -rf build",
  } as unknown as ApprovalRequest;

  it("shows the command in full", () => {
    const { lastFrame } = render(<Approval request={request} onAnswer={vi.fn()} />);
    expect(lastFrame()).toContain("rm -rf build");
    expect(lastFrame()).toContain("Run this command?");
  });

  it("maps y, a, n and escape onto the three answers", async () => {
    const cases = [
      [{ key: "y" }, "allow"],
      [{ key: "a" }, "always"],
      [{ key: "n" }, "deny"],
      [{ key: ESC }, "deny"],
    ] as const;
    for (const [{ key }, answer] of cases) {
      const onAnswer = vi.fn();
      const { stdin } = render(<Approval request={request} onAnswer={onAnswer} />);
      await tick();
      stdin.write(key);
      await tick();
      expect(onAnswer).toHaveBeenCalledWith(answer);
    }
  });
});

describe("TextInput", () => {
  function Harness({ onSubmit }: { onSubmit: (value: string) => void }) {
    const [value, setValue] = React.useState("");
    return (
      <TextInput value={value} onChange={setValue} onSubmit={onSubmit} history={["earlier"]} />
    );
  }

  it("types and submits", async () => {
    const onSubmit = vi.fn();
    const { stdin } = render(<Harness onSubmit={onSubmit} />);
    await tick();
    stdin.write("hello");
    await tick();
    stdin.write(ENTER);
    await tick();
    expect(onSubmit).toHaveBeenCalledWith("hello");
  });

  it("makes a new line from a trailing backslash instead of sending", async () => {
    const onSubmit = vi.fn();
    const { stdin } = render(<Harness onSubmit={onSubmit} />);
    await tick();
    stdin.write("one\\");
    await tick();
    stdin.write(ENTER);
    await tick();
    expect(onSubmit).not.toHaveBeenCalled();
    stdin.write("two");
    await tick();
    stdin.write(ENTER);
    await tick();
    expect(onSubmit).toHaveBeenCalledWith("one\ntwo");
  });

  it("recalls the previous input with the up arrow", async () => {
    const onSubmit = vi.fn();
    const { stdin } = render(<Harness onSubmit={onSubmit} />);
    await tick();
    stdin.write(ARROW_UP);
    await tick();
    stdin.write(ENTER);
    await tick();
    expect(onSubmit).toHaveBeenCalledWith("earlier");
  });

  it("masks a secret", async () => {
    const { stdin, lastFrame } = render(
      <TextInput value="" onChange={() => {}} onSubmit={() => {}} history={[]} mask="*" />,
    );
    await tick();
    stdin.write("sk-secret");
    await tick();
    expect(lastFrame()).not.toContain("sk-secret");
  });
});

describe("Transcript", () => {
  it("renders each kind of item", () => {
    const { lastFrame } = render(
      <Transcript
        width={60}
        items={[
          { id: "1", kind: "user", text: "hello" },
          { id: "2", kind: "assistant", text: "# Title" },
          {
            id: "3",
            kind: "tool",
            name: "edit_file",
            text: "src/a.ts",
            diff: "--- a\n+++ b\n+added",
          },
          { id: "4", kind: "error", text: "it broke" },
        ]}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("hello");
    expect(frame).toContain("Title");
    expect(frame).toContain("edit_file");
    expect(frame).toContain("+added");
    expect(frame).toContain("it broke");
  });
});
