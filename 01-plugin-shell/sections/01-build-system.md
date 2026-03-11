# 01 — Build System

## Summary

Set up the project scaffolding: `package.json`, `tsconfig.json`, `esbuild.config.mjs`, and `.gitignore`. This gives us `npm run build` (single production build) and `npm run dev` (watch mode) that produce `main.js` and `styles.css` at the plugin root — exactly where Obsidian expects them.

## Files to Create

| File | Purpose |
|------|---------|
| `package.json` | Dependencies, metadata, build scripts |
| `tsconfig.json` | TypeScript strict-mode config |
| `esbuild.config.mjs` | Bundler config (ESM, Obsidian conventions) |
| `.gitignore` | Ignore node_modules, dist artifacts, OS files |

## Implementation Details

### package.json

```json
{
  "name": "vault-blueprint",
  "version": "0.1.0",
  "description": "Obsidian plugin — interactive node-graph visualization of your vault's architecture",
  "main": "main.js",
  "scripts": {
    "build": "node esbuild.config.mjs production",
    "dev": "node esbuild.config.mjs"
  },
  "keywords": ["obsidian", "plugin", "vault", "graph", "blueprint"],
  "author": "Aragorn Meulendijks",
  "license": "MIT",
  "devDependencies": {
    "obsidian": "latest",
    "@types/node": "^22.0.0",
    "esbuild": "^0.24.0",
    "typescript": "^5.7.0"
  }
}
```

Key decisions:
- `"main": "main.js"` — Obsidian loads this file.
- Zero `dependencies` — everything is a devDependency. The `obsidian` package provides types only; the actual API is injected at runtime by the Obsidian app.
- No `@anthropic` or other runtime deps. Plugin must have zero runtime dependencies per spec.

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"],
    "baseUrl": ".",
    "outDir": "./dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Key decisions:
- `"strict": true` — required by spec.
- `"noEmit": true` — TypeScript is used for type-checking only; esbuild does the actual bundling.
- `"moduleResolution": "bundler"` — modern resolution that works with esbuild.
- `"target": "ES2022"` — Obsidian's Electron supports modern JS; no need to downlevel.
- `"isolatedModules": true` — required for esbuild compatibility (esbuild compiles files individually).

### esbuild.config.mjs

```javascript
import esbuild from "esbuild";
import { copyFileSync } from "fs";

const isProduction = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
  ],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: isProduction ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: isProduction,
});

if (isProduction) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
```

Key decisions:
- All `obsidian`, `electron`, and `@codemirror/*` packages marked external — these are provided by Obsidian at runtime and must NOT be bundled.
- `format: "cjs"` — Obsidian expects CommonJS output.
- `outfile: "main.js"` — output directly to plugin root.
- Watch mode for `npm run dev` rebuilds on file change.
- `styles.css` is NOT processed by esbuild — it's a static file that Obsidian loads directly from the plugin root. No CSS bundling needed.

### .gitignore

```
node_modules/
main.js
*.map
.DS_Store
Thumbs.db
*.swp
*.swo
data.json
```

Note: `main.js` is gitignored because it's a build artifact. `styles.css` is NOT gitignored — it's a source file. `data.json` is Obsidian's per-vault settings storage — never commit it.

## Acceptance Criteria

1. `npm install` completes without errors and installs exactly 4 devDependencies (obsidian, @types/node, esbuild, typescript).
2. `npx tsc --noEmit` passes with zero errors (once source files from sections 02-05 exist).
3. `npm run build` produces `main.js` at the plugin root.
4. `main.js` does NOT contain bundled code from `obsidian` or `@codemirror/*` (these are external).
5. `main.js` is CommonJS format (contains `module.exports` or `exports.`).
6. `npm run dev` starts watch mode and rebuilds on file changes.
7. No runtime dependencies in `node_modules` after install — only devDependencies.

## Test Approach

- Run `npm install && npm run build` and verify `main.js` exists and is non-empty.
- Grep `main.js` for `require("obsidian")` to confirm the obsidian package is external.
- Run `npx tsc --noEmit` to confirm type-checking passes.
- Run `npm run dev`, modify a source file, confirm rebuild triggers.
- Verify `main.js` size is small (< 10KB for the shell — no runtime deps bundled).
