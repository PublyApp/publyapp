# PublyApp Homepage Factory

This factory generates **high-variance prompt packs** so you can spin up dozens (or hundreds) of
homepage concepts and pick your favorite direction.

## Why this exists

You asked for a strategy similar to your portfolio factory workflow, but tuned for:

- Premium B2B SaaS homepage quality
- Award-level visual direction targets
- Broad variation across layout + style + tone
- Agentic prompts that explicitly ask for design skill usage from `skills.sh`
- Color direction boosts from Hue (`dominikmartn/hue`)

## What gets generated

Running the generator creates:

- `docs/misc/homepage-factory/generated-prompts/*.md`
  - One prompt file per variant
  - Includes a **System Prompt** and **User Prompt**
- `docs/misc/homepage-factory/generated-prompts/manifest.json`
  - A quick index of all generated variants + chosen style axes

## Usage

```bash
node scripts/generate-homepage-prompts.mjs
```

Defaults:

- 24 variants
- seed: current date (`YYYY-MM-DD`)

### Generate a custom amount

```bash
node scripts/generate-homepage-prompts.mjs 60
```

### Generate deterministic sets (repeatable)

```bash
node scripts/generate-homepage-prompts.mjs 60 "publyapp-batch-1"
```

## Recommended workflow

1. Generate 30-100 prompt variants.
2. Feed each file to your preferred coding/design AI model.
3. Render outputs and shortlist top 5.
4. Run another batch that mutates only around the winning direction.
5. Merge best ideas into one final production homepage.

## Prompt strategy (core idea)

Each variant combines randomized dimensions from the inspiration bank:

- Hero style
- Layout storytelling angle
- Motion behavior
- Color mood
- Copy tone
- Style anchors + gallery inspiration links

This ensures every output feels distinct instead of producing near-duplicates.

## Editing the style space

Tune the generation space here:

- `scripts/homepage-factory/inspiration-bank.json`

Add or remove entries to shift the visual DNA of future prompt batches.
