# PublyApp Homepage Factory

This factory generates curated homepage prompt variants for PublyApp. It is optimized for higher
average homepage quality, not maximum random variation.

## What changed

Each variant now combines:

- one shared PublyApp core profile
- one audience overlay
- one curated homepage archetype
- one compatible promise angle
- one compatible proof strategy
- one compatible creative bundle

## Files That Control The Factory

- `scripts/homepage-factory/product-core.json`
- `scripts/homepage-factory/audience-overlays.json`
- `scripts/homepage-factory/homepage-archetypes.json`
- `scripts/homepage-factory/promise-angles.json`
- `scripts/homepage-factory/proof-strategies.json`
- `scripts/homepage-factory/creative-bundles.json`

## Output Shape

Each generated prompt now includes:

- variant metadata, including the variant seed
- strategy-first system prompt guardrails
- product core block
- audience overlay block with proof expectations, CTA preference, product focus, FAQ concerns, and tone adjustments
- archetype brief with required and optional section guidance
- creative direction block
- messaging and section emphasis rules that apply overlay + archetype strategy to the output
- concept-before-implementation working order

Generated outputs live in `docs/misc/homepage-factory/generated-prompts/`, and the committed
review artifact set includes both the prompt files and `manifest.json`.
