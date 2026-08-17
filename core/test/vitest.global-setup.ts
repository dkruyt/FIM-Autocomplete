import fs from "fs";
import path from "path";

// Sets up the GLOBAL directory for testing - equivalent to ~/.fim
// IMPORTANT: the FIM_GLOBAL_DIR environment variable is used in util/paths for
// getting all local paths
export default async function () {
  process.env.FIM_GLOBAL_DIR = path.join(__dirname, ".fim-test");
  if (fs.existsSync(process.env.FIM_GLOBAL_DIR)) {
    fs.rmSync(process.env.FIM_GLOBAL_DIR, {
      recursive: true,
      force: true,
    });
  }
}
