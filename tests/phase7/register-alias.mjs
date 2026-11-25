import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const srcRoot = path.join(projectRoot, "src");

function resolveCandidateFile(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.mjs`,
    `${basePath}.js`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
    path.join(basePath, "index.mjs"),
    path.join(basePath, "index.js"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const targetPath = path.join(srcRoot, specifier.slice(2));
      const resolvedUrl = resolveCandidateFile(targetPath);
      if (resolvedUrl) {
        return { url: resolvedUrl, shortCircuit: true };
      }
    }

    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith("file:")
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const targetPath = path.resolve(parentDir, specifier);
      if (targetPath.startsWith(srcRoot) && !fs.existsSync(targetPath)) {
        const resolvedUrl = resolveCandidateFile(targetPath);
        if (resolvedUrl) {
          return { url: resolvedUrl, shortCircuit: true };
        }
      }
    }

    return nextResolve(specifier, context);
  },
});
