export function isWindowsCommandShim(command, platform = process.platform) {
  return platform === "win32" && /\.(cmd|bat)$/i.test(String(command || ""));
}

export function quoteWindowsCmdArg(value) {
  const text = String(value);
  if (text === "") return '""';
  if (!/[ \t&()<>^|"]/.test(text)) return text;
  const escaped = text
    .replace(/(\\*)"/g, '$1$1\\"')
    .replace(/(\\+)$/g, "$1$1");
  return `"${escaped}"`;
}

export function buildCommandInvocation(command, args = [], options = {}) {
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  if (!isWindowsCommandShim(command, platform)) {
    return {
      command,
      args,
      options: {
        windowsHide: true
      }
    };
  }

  return {
    command: env.ComSpec || "cmd.exe",
    args: [
      "/d",
      "/s",
      "/c",
      [command, ...args].map(quoteWindowsCmdArg).join(" ")
    ],
    options: {
      windowsHide: true
    }
  };
}
