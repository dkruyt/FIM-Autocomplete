const fs = require("fs");
const path = require("path");

const ncp = require("ncp").ncp;
const { rimrafSync } = require("rimraf");

const { validateFilesPresent, execCmdSync } = require("../../../scripts/util");
const { writeBuildTimestamp, repoRoot } = require("./utils");

// Clear folders that will be packaged to ensure clean slate
rimrafSync(path.join(__dirname, "..", "out"));
fs.mkdirSync(path.join(__dirname, "..", "out", "node_modules"), {
  recursive: true,
});

const skipInstalls = process.env.SKIP_INSTALLS === "true";

function copyDir(from, to, label) {
  return new Promise((resolve, reject) => {
    ncp(from, to, { dereference: true }, (error) => {
      if (error) {
        console.warn(`[error] Error copying ${label}`, error);
        reject(error);
      } else {
        console.log(`[info] Copied ${label}`);
        resolve();
      }
    });
  });
}

void (async () => {
  console.log("[info] Packaging extension");

  writeBuildTimestamp();

  if (!skipInstalls) {
    process.chdir(path.join(repoRoot, "extensions", "vscode"));
    execCmdSync("npm install");
    console.log("[info] npm install in extensions/vscode completed");
  }

  process.chdir(path.join(repoRoot, "extensions", "vscode"));
  fs.mkdirSync("out", { recursive: true });

  // tree-sitter grammars, used by the AST/root-path-context snippet sources
  await copyDir(
    path.join(__dirname, "../../../core/node_modules/tree-sitter-wasms/out"),
    path.join(__dirname, "../out/tree-sitter-wasms"),
    "tree-sitter-wasms",
  );

  // The tree-sitter runtime plus the tokenizers used for prompt budgeting
  const filesToCopy = [
    "../../../core/vendor/tree-sitter.wasm",
    "../../../core/llm/llamaTokenizerWorkerPool.mjs",
    "../../../core/llm/llamaTokenizer.mjs",
    "../../../core/llm/tiktokenWorkerPool.mjs",
  ];

  for (const f of filesToCopy) {
    fs.copyFileSync(
      path.join(__dirname, f),
      path.join(__dirname, "..", "out", path.basename(f)),
    );
    console.log(`[info] Copied ${path.basename(f)}`);
  }

  // The tokenizer workers above are real ESM files loaded from disk at runtime,
  // so their imports must resolve inside out/node_modules rather than the bundle.
  for (const mod of ["workerpool", "js-tiktoken"]) {
    fs.mkdirSync(`out/node_modules/${mod}`, { recursive: true });
    await copyDir(
      path.join(__dirname, `../../../core/node_modules/${mod}`),
      `out/node_modules/${mod}`,
      mod,
    );
  }

  validateFilesPresent([
    // tree-sitter queries for the autocomplete context sources
    "tree-sitter/import-queries/typescript.scm",
    "tree-sitter/root-path-context-queries/typescript/function_declaration.scm",

    // tree-sitter runtime + a representative grammar
    "out/tree-sitter.wasm",
    "out/tree-sitter-wasms/tree-sitter-typescript.wasm",

    // tokenizers + their runtime deps
    "out/llamaTokenizer.mjs",
    "out/tiktokenWorkerPool.mjs",
    "out/node_modules/workerpool/package.json",
    "out/node_modules/js-tiktoken/package.json",
  ]);

  console.log("[info] Prepackage complete");
})();
