import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Read the package version at runtime so server metadata and the default
 * User-Agent stay in sync with package.json. Both src/version.ts and the
 * compiled dist/version.js sit one level below the package root, and npm always
 * ships package.json in the published tarball, so this resolves under npx too.
 */
export function readVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf-8")) as {
    version?: string;
  };
  return pkg.version ?? "0.0.0";
}
