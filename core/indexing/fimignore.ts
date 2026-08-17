import fs from "fs";
import { IDE } from "..";
import { getGlobalFimIgnorePath } from "../util/paths";
import { gitIgArrayFromFile } from "./ignore";

export const FIM_IGNORE_FILENAME = ".fimignore";

export const getGlobalFimIgArray = () => {
  const contents = fs.readFileSync(getGlobalFimIgnorePath(), "utf8");
  return gitIgArrayFromFile(contents);
};

export const getWorkspaceFimIgArray = async (ide: IDE) => {
  const dirs = await ide.getWorkspaceDirs();
  return await dirs.reduce(
    async (accPromise, dir) => {
      const acc = await accPromise;
      try {
        const contents = await ide.readFile(`${dir}/${FIM_IGNORE_FILENAME}`);
        return [...acc, ...gitIgArrayFromFile(contents)];
      } catch (err) {
        console.error(err);
        return acc;
      }
    },
    Promise.resolve([] as string[]),
  );
};
