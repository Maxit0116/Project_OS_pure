import { cpSync } from "node:fs";
import { relative, sep } from "node:path";

/**
 * Copies the sample workspace for a test without its installed dependencies or build output.
 *
 * The sample's own tests need `sample-graph-saas/node_modules` (prisma, next), which is hundreds of
 * megabytes; a copy that carried it along made every test that opens a workspace slow and filled the
 * temp folder. Everything else, including `.projectos` and `.git`, is copied as before.
 */
export function copySampleTree(source: string, destination: string): void {
  cpSync(source, destination, {
    recursive: true,
    filter: (path) => {
      const rel = relative(source, path);
      if (rel === "") return true;
      const top = rel.split(sep)[0];
      return top !== "node_modules" && top !== ".next";
    },
  });
}
