/** A small glob→RegExp compiler so core keeps zero runtime dependencies.
 *  Supports the syntax an agent actually uses: `**`, `*`, `?`, `{a,b}` and
 *  character classes. */
export function globToRegExp(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]!;
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        // `**/` matches zero or more directories; a bare `**` matches anything.
        if (pattern[i + 2] === "/") {
          out += "(?:[^/]*\\/)*";
          i += 2;
        } else {
          out += ".*";
          i += 1;
        }
      } else {
        out += "[^/]*";
      }
    } else if (char === "?") {
      out += "[^/]";
    } else if (char === "{") {
      const close = pattern.indexOf("}", i);
      if (close === -1) {
        out += "\\{";
      } else {
        const options = pattern.slice(i + 1, close).split(",");
        out += `(?:${options.map(escapeLiteral).join("|")})`;
        i = close;
      }
    } else if (char === "[") {
      const close = pattern.indexOf("]", i);
      if (close === -1) {
        out += "\\[";
      } else {
        out += pattern.slice(i, close + 1);
        i = close;
      }
    } else {
      out += escapeLiteral(char);
    }
  }
  return new RegExp(`^${out}$`);
}

function escapeLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchesGlob(pattern: string, filePath: string): boolean {
  return globToRegExp(pattern).test(filePath);
}
