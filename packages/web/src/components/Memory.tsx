import React from "react";
import type { MemoryFile } from "@magnetar/core";
import { api } from "../lib/client.js";

/** Project memory, editable in place. These files go into every system prompt,
 *  so being able to see and fix them is the difference between an agent that
 *  learns the project and one that keeps guessing. */
export function Memory(): React.ReactElement {
  const [files, setFiles] = React.useState<MemoryFile[] | null>(null);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [saved, setSaved] = React.useState<string | null>(null);

  React.useEffect(() => {
    void api
      .memory()
      .then(setFiles)
      .catch(() => setFiles([]));
  }, []);

  const save = async (file: MemoryFile) => {
    const content = drafts[file.file] ?? file.content;
    const updated = await api.writeMemory(file.file, content).catch(() => null);
    if (updated) {
      setFiles(updated);
      setSaved(file.file);
      setTimeout(() => setSaved(null), 1500);
    }
  };

  if (files === null)
    return (
      <div className="notice" style={{ padding: 8 }}>
        loading…
      </div>
    );

  return (
    <>
      <div className="panel-title">Memory</div>
      {files.length === 0 ? (
        <div className="notice" style={{ padding: 8 }}>
          No MAGNETAR.md yet. Run /init in the terminal to write one.
        </div>
      ) : null}
      {files.map((file) => (
        <div key={file.file} className="memory-file">
          <header>
            {file.name}
            <button style={{ float: "right" }} onClick={() => void save(file)}>
              {saved === file.file ? "saved" : "save"}
            </button>
          </header>
          <textarea
            value={drafts[file.file] ?? file.content}
            onChange={(event) =>
              setDrafts((current) => ({ ...current, [file.file]: event.target.value }))
            }
            spellCheck={false}
          />
        </div>
      ))}
    </>
  );
}
