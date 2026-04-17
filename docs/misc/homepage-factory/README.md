# PublyApp Homepage Factory

This factory generates curated homepage prompt variants for PublyApp. The
default workflow is batch-first: generate the prompt archive and the runtime
homepage scaffolding together, then use the resulting mapping to review or
implement each route.

## Primary Workflow

```bash
pnpm generate:homepage-batch -- <variants> <batch-label>
```

This command is the documented entrypoint for homepage batch work. It creates a
prompt archive and new generated homepage scaffolds in one pass.

### Previewing Generated Pages

1. Start the frontend (`just dev-front`).
2. Open a generated route on the frontend server (port `5050`), for example:

```text
http://localhost:5050/homepage-gen/1
http://localhost:5050/homepage-gen/2
```

### What It Writes

- Prompt batch folders are written under
  `docs/misc/homepage-factory/generated-prompts/batches/<archive-folder>/`.
- Each batch folder gets its own `manifest.json` plus one prompt file per
  variant, such as `001-homepage-prompt.md`.
- The top-level batch index lives at
  `docs/misc/homepage-factory/generated-prompts/batches/index.json`.
- Page scaffold files are written under
  `apps/front/src/generated/homepage-gen/pages/` as `generated-homepage-0001.tsx`,
  `generated-homepage-0002.tsx`, and so on.
- The runtime homepage manifest lives at
  `apps/front/src/generated/homepage-gen/manifest.json`.

### How The Mapping Works

The per-batch `manifest.json` is the source of truth for mapping prompt file to
page file to route:

- `promptFile` points to the archived prompt markdown file.
- `pageFile` points to the generated scaffold in
  `apps/front/src/generated/homepage-gen/pages/`.
- `routePath` points to the runtime preview route, such as `/homepage-gen/1`.

Do not infer the generated homepage ID from the prompt filename. Prompt files
restart at `001` in each batch, while generated homepage IDs keep increasing
globally. Use the batch manifest entry to resolve
`001-homepage-prompt.md -> generated-homepage-0001.tsx -> /homepage-gen/1` for
that specific batch.

Batch labels are normalized to a slug, and repeated labels receive a numeric
suffix when needed. That means older batch archives stay intact even when you
run the same label again.

### Preservation Rules

The batch command is append-only for existing work:

- Old prompt archives remain in `generated-prompts/batches/`.
- Old homepage routes remain in `apps/front/src/generated/homepage-gen/`.
- New runs append new entries instead of rewriting older batch records.
- If a batch-label collision happens, the command creates a new archive folder
  rather than overwriting the existing one.

### What This Command Does Not Do

`pnpm generate:homepage-batch` is a local repository command. It does not
invoke Codex automation, spin up an agent workflow, or hand the batch off to
any external automation layer. It only writes the prompt archive, batch index,
runtime manifest, and generated page scaffolds.

## Factory Inputs

Each variant combines:

- one shared PublyApp core profile
- one audience overlay
- one curated homepage archetype
- one compatible promise angle
- one compatible proof strategy
- one compatible creative bundle

The variant generation rules are controlled by these files:

- `scripts/homepage-factory/product-core.json`
- `scripts/homepage-factory/audience-overlays.json`
- `scripts/homepage-factory/homepage-archetypes.json`
- `scripts/homepage-factory/promise-angles.json`
- `scripts/homepage-factory/proof-strategies.json`
- `scripts/homepage-factory/creative-bundles.json`

## Output Shape

Each generated prompt includes:

- variant metadata, including the variant seed
- strategy-first system prompt guardrails
- product core block
- audience overlay block with proof expectations, CTA preference, product
  focus, FAQ concerns, and tone adjustments
- archetype brief with required and optional section guidance
- creative direction block
- messaging and section emphasis rules that apply overlay and archetype
  strategy to the output
- concept-before-implementation working order

Generated prompts are archived in
`docs/misc/homepage-factory/generated-prompts/batches/<archive-folder>/`, and
the archive manifest records the batch metadata plus the per-variant mappings.

## Advanced Commands

Use these only when you need the lower-level steps separately:

```bash
pnpm generate:homepage-prompts -- <variants> <seed>
pnpm prepare:generated-homepages -- <variants> <batch-label>
```

- `pnpm generate:homepage-prompts` writes and replaces the flat scratch output
  under `docs/misc/homepage-factory/generated-prompts/`.
- `pnpm prepare:generated-homepages` writes only the runtime scaffolding under
  `apps/front/src/generated/homepage-gen/`.
