# anti-slop (vendored)

Generic Oxlint rules that reject low-evidence and low-signal implementation
patterns.

- **Source:** [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop) @ `6d53855`
- **License:** MIT (upstream)
- **Modifications:** formatting only (`oxfmt`); no behavioural changes, no
  house rules added here.

House PublyApp rules live in [`../publy/`](../publy) — never add them to this
directory. This directory is excluded from lint via `.oxlintrc.json`
(`packages/lint-ts/src/anti-slop/**`).

The plugin entrypoints are:

- `./index.ts` — the `anti-slop` plugin (default export).
- `./effect/index.ts` — the opt-in `anti-slop-effect` plugin.
