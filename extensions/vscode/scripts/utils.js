const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..", "..", "..");

// We can't simply touch one of our files to trigger a rebuild, because
// esbuild doesn't always use modifications times to detect changes -
// for example, if it finds a file changed within the last 3 seconds,
// it will fall back to full-contents-comparison for that file
//
// So to facilitate development workflows, we always include a timestamp string
// in the build
function writeBuildTimestamp() {
  fs.writeFileSync(
    path.join(repoRoot, "extensions/vscode", "src/.buildTimestamp.ts"),
    `export default "${new Date().toISOString()}";\n`,
  );
}

module.exports = {
  repoRoot,
  writeBuildTimestamp,
};
