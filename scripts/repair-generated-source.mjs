#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const repairs = [
  {
    path: "artifacts/ts-commerce/src/App.tsx",
    replacements: [["commerce.' } }} routerPush=", "commerce.' } }}} routerPush="]],
  },
];

for (const repair of repairs) {
  let source = await readFile(repair.path, "utf8");
  let changed = false;
  for (const [from, to] of repair.replacements) {
    if (source.includes(from)) {
      source = source.replaceAll(from, to);
      changed = true;
    }
  }
  if (changed) await writeFile(repair.path, source);
}
