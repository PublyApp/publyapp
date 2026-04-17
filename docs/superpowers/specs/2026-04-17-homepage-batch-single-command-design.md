# Homepage Batch Single-Command Flow

## Summary

Replace the current two-command homepage generation workflow with one append-only batch command.

Today the system splits prompt generation and preview-route scaffolding into separate commands:

- `pnpm generate:homepage-prompts -- <variants> <seed>`
- `pnpm prepare:generated-homepages -- <variants> <batchLabel>`

That works technically, but it is awkward to use because the user must manually keep prompt files,
generated page files, and preview routes aligned.

The new design introduces one primary command:

```bash
pnpm generate:homepage-batch -- <variants> <batch-label>
```

That command will create a complete append-only batch by:

1. reserving new generated homepage ids
2. creating new generated page scaffold files
3. generating a matching prompt batch into a dedicated archive folder
4. writing a per-batch manifest with exact prompt-to-page-to-route mapping
5. appending a top-level batch index for discovery and review
6. printing the mapping in the terminal for immediate use

The result is a single stable artifact per run that the user can review, implement, and revisit
later without losing previous batches.

## Goals

- Make homepage factory usage feel like one coherent workflow instead of two unrelated scripts.
- Preserve every generated batch as an append-only artifact.
- Preserve every generated homepage route and scaffold file as an append-only artifact.
- Give the user one obvious place to see which prompt maps to which page file and preview URL.
- Keep the existing `/homepage-gen/:id` preview route model intact.
- Keep low-level commands available for targeted or scripted use.

## Non-Goals

- Automating Codex execution or page implementation.
- Replacing generated homepage ids with batch-local route ids.
- Migrating old prompt batches into the new structure retroactively.
- Changing the homepage prompt strategy model that was introduced in the previous redesign.

## Current Problems

The current flow has three usability problems:

1. Prompt generation is not append-only.
   `docs/misc/homepage-factory/generated-prompts/` behaves like a latest-run scratch folder, so
   each new batch replaces the prompt markdown files from the previous run.

2. Prompt generation and page-slot generation are disconnected.
   The user must run two commands and manually assume that prompt `001` corresponds to the first
   new page scaffold created in that separate run.

3. There is no single source of truth for a batch.
   Runtime page metadata lives in `apps/front/src/generated/homepage-gen/manifest.json`, while
   prompt metadata lives in `docs/misc/homepage-factory/generated-prompts/manifest.json`. Neither
   artifact directly describes one complete batch run.

## Recommended Approach

Adopt a single-command, batch-first model with archived prompt folders and a top-level batch index.

This is the best balance between usability and code reuse:

- usability improves because the user runs one command
- old batches remain available because prompt output becomes append-only
- existing route/runtime behavior stays compatible because generated homepage ids continue to live in
  the existing frontend manifest
- implementation risk stays moderate because the new command can reuse the existing prompt generator
  and generated-homepage scaffolder internally

## User Workflow

The new default workflow is:

```bash
pnpm generate:homepage-batch -- 5 april-17-batch
```

After that command finishes, the user can:

1. open the batch manifest
2. choose an entry
3. use the mapped prompt file to generate a page
4. implement that page in the mapped scaffold file
5. preview the result at the mapped `/homepage-gen/:id` route

The command output should print a compact mapping such as:

```text
Generated homepage batch "april-17-batch" with 5 variants
- /homepage-gen/1 -> apps/front/src/generated/homepage-gen/pages/generated-homepage-0001.tsx -> docs/misc/homepage-factory/generated-prompts/batches/april-17-batch/001-homepage-prompt.md
- /homepage-gen/2 -> apps/front/src/generated/homepage-gen/pages/generated-homepage-0002.tsx -> docs/misc/homepage-factory/generated-prompts/batches/april-17-batch/002-homepage-prompt.md
```

## Command Design

### Primary Command

Add a new package script:

```json
"generate:homepage-batch": "node ./scripts/generate-homepage-batch.mjs"
```

Usage:

```bash
pnpm generate:homepage-batch -- <variants> <batch-label>
```

Defaults:

- `variants` defaults to `24`
- `batch-label` defaults to the current ISO date, e.g. `2026-04-17`

Validation rules:

- variants must stay within the existing `1..200` limits
- batch label must be a filesystem-safe slug
- a batch label may be reused only if the command can deterministically allocate a unique archived
  folder name without overwriting an older batch

### Backward Compatibility

Keep the current low-level commands:

- `pnpm generate:homepage-prompts`
- `pnpm prepare:generated-homepages`

They remain valid, but the README should position them as lower-level building blocks rather than
the normal way to use the factory.

## File and Manifest Structure

### Runtime Generated Homepage Manifest

Keep:

- `apps/front/src/generated/homepage-gen/manifest.json`

This remains the runtime registry used by the frontend preview route system. It should continue to
append one entry per generated homepage id.

Existing entry shape:

- `id`
- `title`
- `fileName`
- `routePath`
- `batchLabel`
- `createdAt`

This manifest may be enriched with batch metadata if useful, but it should remain focused on the
generated page registry required at runtime.

### Archived Prompt Batch Root

Introduce:

- `docs/misc/homepage-factory/generated-prompts/batches/`

This becomes the append-only prompt archive root.

### Top-Level Batch Index

Introduce:

- `docs/misc/homepage-factory/generated-prompts/batches/index.json`

This file is append-only and stores one summary record per generated batch.

Suggested shape:

```json
[
  {
    "batchLabel": "april-17-batch",
    "archiveFolder": "april-17-batch",
    "seed": "april-17-batch",
    "variantCount": 5,
    "createdAt": "2026-04-17T12:00:00.000Z",
    "manifestFile": "docs/misc/homepage-factory/generated-prompts/batches/april-17-batch/manifest.json",
    "entryIds": [1, 2, 3, 4, 5]
  }
]
```

`entryIds` refers to generated homepage ids in the frontend runtime manifest.

### Per-Batch Prompt Folder

Each run creates a dedicated folder:

- `docs/misc/homepage-factory/generated-prompts/batches/<archive-folder>/`

That folder contains:

- `001-homepage-prompt.md`
- `002-homepage-prompt.md`
- ...
- `manifest.json`

### Per-Batch Manifest

Each batch folder contains a manifest that is the source of truth for prompt-to-page mapping.

Suggested shape:

```json
{
  "batchLabel": "april-17-batch",
  "archiveFolder": "april-17-batch",
  "seed": "april-17-batch",
  "variantCount": 5,
  "createdAt": "2026-04-17T12:00:00.000Z",
  "entries": [
    {
      "variant": 1,
      "generatedHomepageId": 1,
      "routePath": "/homepage-gen/1",
      "pageFile": "apps/front/src/generated/homepage-gen/pages/generated-homepage-0001.tsx",
      "promptFile": "docs/misc/homepage-factory/generated-prompts/batches/april-17-batch/001-homepage-prompt.md",
      "audienceOverlay": "agencies",
      "homepageArchetype": "comparison-led",
      "promiseAngle": "publish-without-chaos",
      "proofStrategy": "comparison-checklist",
      "creativeDirectionBundle": "product-led-clean",
      "selectedReferences": [
        "https://stripe.com",
        "https://linear.app"
      ],
      "selectedLibraries": [
        "https://land-book.com/"
      ]
    }
  ]
}
```

This manifest deliberately combines runtime mapping and prompt strategy metadata so the user can
review a batch without opening multiple files.

## Archive Naming Rules

The system must be append-only, even when the same batch label is reused.

Recommended rule:

- first run uses `<batch-label>`
- later collisions use `<batch-label>-2`, `<batch-label>-3`, and so on

The top-level batch index should store both:

- the user-facing `batchLabel`
- the actual `archiveFolder`

This preserves the original label while guaranteeing that no archived prompt batch is overwritten.

## Internal Flow

The new command should execute in this order:

1. Validate arguments.
2. Resolve repo paths.
3. Determine the next available archive folder under `generated-prompts/batches/`.
4. Reserve the next generated homepage ids by reading the existing runtime manifest.
5. Create the generated homepage scaffold files and append them to the runtime manifest.
6. Generate the matching prompt files directly into the batch archive folder.
7. Build the per-batch manifest by joining prompt metadata with generated homepage entries.
8. Append the batch summary to `generated-prompts/batches/index.json`.
9. Print the final mapping summary.

This order keeps the two append-only systems aligned while avoiding a second manual step.

## Code Structure Direction

Follow existing script boundaries and add one orchestrator instead of collapsing everything into one
large file.

Suggested responsibilities:

- `scripts/generate-homepage-batch.mjs`
  - CLI entry point for the new single-command flow
- `scripts/homepage-factory/generated-homepage-batches.mjs`
  - keep ownership of generated page scaffold creation and runtime manifest updates
- `scripts/homepage-factory/generator.mjs`
  - keep ownership of prompt selection, prompt rendering, and prompt metadata generation
- `scripts/homepage-factory/prompt-batch-archive.mjs`
  - new helper for archive folder resolution, per-batch manifest writing, and top-level batch index

The goal is explicit boundaries:

- page scaffolding owns ids, route paths, and React files
- prompt generation owns prompt contents and prompt strategy metadata
- batch archiving owns append-only prompt storage and combined batch manifests
- the CLI orchestrator wires them together

## Existing Manifest Migration

Current file:

- `docs/misc/homepage-factory/generated-prompts/manifest.json`

After this change, it should no longer act as the authoritative current-batch manifest.

Recommended migration:

- leave existing generated prompt files alone
- introduce `generated-prompts/batches/` as the new authoritative structure
- stop writing new batches into the old flat `generated-prompts/` folder
- update the README to point users to the new batch archive structure

This avoids risky retroactive migration work while ensuring all future runs are append-only.

## Error Handling

The command should fail early and clearly when:

- variants is invalid
- the batch label cannot be normalized safely
- a target scaffold file already exists for a reserved homepage id
- a per-batch archive folder cannot be created
- any manifest file contains invalid JSON or an unexpected shape

Failure behavior should prioritize not corrupting append-only records. If possible, file writes
should be staged so that a partially written batch does not leave mismatched prompt and page
artifacts behind.

The implementation does not need a full transactional system, but it should avoid writing the batch
index before per-batch artifacts have been created successfully.

## Testing Strategy

Add focused Node tests around the new orchestration layer and archive helpers.

Required coverage:

- single-command batch generation creates page files, prompt files, runtime manifest entries, batch
  manifest, and batch index entries
- rerunning with a new label appends without overwriting older batches
- rerunning with the same label allocates a unique archive folder instead of overwriting
- per-batch manifest entries correctly map prompt file, page file, route path, and generated
  homepage id
- runtime manifest ids continue incrementing from the highest existing id
- prompt strategy metadata is preserved in the per-batch manifest
- old low-level commands remain usable

If the easiest implementation path is to extract pure helper functions for archive naming and
manifest shaping, prefer that. The append-only guarantees are easier to test in isolated units than
through a single large CLI test.

## README Changes

Update `docs/misc/homepage-factory/README.md` so the primary documented workflow is:

```bash
pnpm generate:homepage-batch -- 5 april-17-batch
```

The README should explain:

- where batch folders are written
- where page scaffold files are written
- where to find the top-level batch index
- how to map one prompt to one generated page file
- that Codex automation is not part of this command
- that old batches and preview routes are preserved

The low-level commands can remain documented in a smaller advanced section.

## Acceptance Criteria

This design is successful when:

- one command produces a complete, reviewable homepage batch
- prompt batches are fully append-only
- generated page routes remain fully append-only
- every batch has a dedicated manifest that maps prompt file to page file to route path
- a top-level batch index makes it easy to discover previous runs
- the user no longer needs to manually align prompt `001..N` with newly created page ids
- the existing `/homepage-gen/:id` runtime model still works
- no Codex execution is triggered automatically

## Recommendation

Implement a new `generate:homepage-batch` command as the default homepage factory workflow.

Keep page scaffolding and prompt generation as separate internal responsibilities, but connect them
through an append-only batch archive model with:

- one dedicated prompt folder per run
- one per-batch manifest that combines prompt and route mapping
- one top-level batch index for discovery
- continued use of the existing generated homepage runtime manifest for route registration

This gives the user the simplest workable interface without introducing automation that is out of
scope for the current request.
