import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * Global data directory. Holds the completion cache and the global ignore file.
 * Override with FIM_GLOBAL_DIR.
 */
const GLOBAL_DIR = (() => {
  const configPath = process.env.FIM_GLOBAL_DIR;
  if (configPath) {
    // Convert relative path to absolute paths based on current working directory
    return path.isAbsolute(configPath)
      ? configPath
      : path.resolve(process.cwd(), configPath);
  }
  return path.join(os.homedir(), ".fim");
})();

export function getGlobalPath(): string {
  if (!fs.existsSync(GLOBAL_DIR)) {
    fs.mkdirSync(GLOBAL_DIR, { recursive: true });
  }
  return GLOBAL_DIR;
}

/**
 * Global `.fimignore` file. Patterns here suppress autocomplete everywhere, in
 * addition to any per-workspace `.fimignore`.
 */
export function getGlobalFimIgnorePath(): string {
  const fimIgnorePath = path.join(getGlobalPath(), ".fimignore");
  if (!fs.existsSync(fimIgnorePath)) {
    fs.writeFileSync(fimIgnorePath, "");
  }
  return fimIgnorePath;
}
