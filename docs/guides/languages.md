# Languages — C# and TypeScript only

Owner rule (Radan, 2026-11-04, issue #2306): every **program** in this repository is written in
exactly one of two languages.

> « Seulement deux langages autorisés dans ce projet. C#, le .cs, et TypeScript, le .ts. […] Pour
> les programmes, ça doit être du .cs et du .ts. Plus jamais de MJS, CJS. »

## Allowed for programs

| Language   | Extensions                            |
| ---------- | ------------------------------------- |
| C#         | `.cs`                                 |
| TypeScript | `.ts`, `.tsx` (React components only) |

A program is anything that runs: application code, tests, build and CI scripts, codegen, guards,
servers, hooks, one-off tooling.

## Forbidden for programs

`.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.cts`, shell scripts (`.sh`, bash, sh), `.py`, `.ps1`, and any other
language. Do not add one, do not convert a TypeScript file to one, and do not keep a new one "just
for now". Node 24 runs `.ts` directly (`node script.ts`), so there is no runtime reason for a
JavaScript file.

## Not programs — always allowed

Configuration and data files of the two ecosystems: JSON (`package.json`, `tsconfig*.json`, …),
XML and MSBuild files (`.csproj`, `.props`, `.targets`, `.slnx`), YAML (workflows, compose),
Markdown, CSS, `.env*`, `.editorconfig`, `.gitignore` / `.gitattributes` / `.dockerignore`,
`.npmrc`, `.nvmrc`, `Dockerfile`, `justfile`, fonts and images.

## Shell glue — tolerated, one line

Some tools only speak shell: `justfile` recipes, GitHub Actions `run:` steps, Dockerfile `RUN`,
git hooks. There, shell is allowed only as glue: **one line that calls a tool or a `.ts` script**.
Any logic — a condition, a loop, a function, a fallback chain — moves into a `.ts` script that the
line calls.

## When you meet an exception

The `.ts` suffix is useless here: every TypeScript package that has them declares
`"type": "module"`, so a `.ts` file behaves the same. Owner, 2026-11-04: « Il faut tout convertir en
.ts. Je veux pas de .ts. »

Files that predate this rule are listed in issue #2306 and are being converted or deleted. When a
change touches one of them, convert it in the same change if it is small; otherwise leave it to
#2306 — never extend it.
