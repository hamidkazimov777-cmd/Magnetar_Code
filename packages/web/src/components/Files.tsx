import React from "react";
import type { FileEntry } from "@magnetar/core";
import { api } from "../lib/client.js";

/** The working directory, with the files this session touched marked. Folders
 *  expand in place; nothing here can reach outside the project, because the
 *  daemon resolves every path inside it. */
export function Files({ refreshKey }: { refreshKey: number }): React.ReactElement {
  const [open, setOpen] = React.useState<Record<string, FileEntry[] | undefined>>({});
  const [root, setRoot] = React.useState<FileEntry[]>([]);
  const [preview, setPreview] = React.useState<{ path: string; content: string } | null>(null);

  React.useEffect(() => {
    void api
      .files(".")
      .then(setRoot)
      .catch(() => setRoot([]));
  }, [refreshKey]);

  const toggle = async (entry: FileEntry) => {
    if (entry.directory) {
      if (open[entry.path]) {
        setOpen((current) => ({ ...current, [entry.path]: undefined }));
        return;
      }
      const children = await api.files(entry.path).catch(() => []);
      setOpen((current) => ({ ...current, [entry.path]: children }));
      return;
    }
    const file = await api.file(entry.path).catch(() => null);
    if (file) setPreview(file);
  };

  const render = (entries: FileEntry[], depth: number): React.ReactNode =>
    entries.map((entry) => (
      <React.Fragment key={entry.path}>
        <button
          className="row"
          data-changed={entry.changed ? "true" : "false"}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={() => void toggle(entry)}
        >
          {entry.directory ? (open[entry.path] ? "▾ " : "▸ ") : "  "}
          {entry.name}
          {entry.directory ? "/" : ""}
        </button>
        {open[entry.path] ? render(open[entry.path]!, depth + 1) : null}
      </React.Fragment>
    ));

  return (
    <>
      <div className="panel-title">Files</div>
      {root.length === 0 ? (
        <div className="notice" style={{ padding: 8 }}>
          empty
        </div>
      ) : (
        render(root, 0)
      )}
      {preview ? (
        <div className="memory-file">
          <header>
            {preview.path}
            <button className="spacer" style={{ float: "right" }} onClick={() => setPreview(null)}>
              close
            </button>
          </header>
          <pre className="tool-body" style={{ maxHeight: 320 }}>
            {preview.content.slice(0, 20000)}
          </pre>
        </div>
      ) : null}
    </>
  );
}
