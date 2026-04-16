# Homepage Factory Redesign

## Summary

Redesign the homepage prompt factory so it generates fewer but substantially higher-quality
homepage prompts. The new factory should stop optimizing for raw aesthetic randomness and instead
optimize for strategically coherent, audience-aware, conversion-capable homepage concepts for
PublyApp.

The revised system will combine:

- a shared structured PublyApp core profile
- one audience overlay per generated variant
- a small set of tightly curated homepage archetypes
- compatibility-filtered creative direction bundles
- a prompt contract that forces concept and messaging decisions before implementation

The target outcome is a batch of prompts that produces homepages which are visually distinct, but
also clearly different in promise, proof strategy, page flow, and CTA framing.

## Goals

- Increase average homepage quality rather than maximizing prompt count or randomness.
- Make each variant feel specifically tailored to PublyApp instead of generic B2B SaaS.
- Ensure every variant targets one primary audience while preserving a stable PublyApp identity.
- Produce prompt files that are easier to review and shortlist by exposing strategy metadata.
- Preserve enough exploration to compare homepage directions without sacrificing coherence.

## Non-Goals

- Building a universal prompt factory for arbitrary products.
- Maximizing combinatorial variety for its own sake.
- Splitting generation into a separate multi-step pipeline unless the current redesign proves
  insufficient.
- Replacing the generator with a database or external content system.

## Current Problems

The current generator is strong on visual ambition but weak on strategic specificity.

- Product context is too thin, so models can generate polished but generic SaaS messaging.
- The generator varies style axes more than persuasion strategy.
- Every variant uses nearly the same section contract, so structure changes too little.
- Creative axes are sampled independently, which allows weak or redundant combinations.
- Variant metadata does not expose enough strategic identity for efficient review.

## Recommended Approach

Adopt a curated archetype factory.

This approach keeps the generator simple enough to maintain while materially improving prompt
quality. Instead of independent random picks for style words, each variant will be assembled from a
small set of compatible decision layers:

1. Shared PublyApp core profile
2. One primary audience overlay
3. One homepage archetype
4. One compatible promise angle
5. One compatible proof strategy
6. One compatible creative direction bundle

This yields meaningful variation without encouraging incoherent or generic outputs.

## Data Model

### Product Core

Store a shared PublyApp product core in structured data. This profile is included in every prompt.

Suggested fields:

- `productName`
- `productSummary`
- `taglineDirections`
- `coreDifferentiators`
- `workflowStrengths`
- `trustSignals`
- `ctaThemes`
- `proofAssets`
- `productVisualRequirements`
- `voiceGuardrails`
- `forbiddenClaims`
- `forbiddenCopyPatterns`

This block should contain the stable truths about PublyApp that should not drift between variants.

### Audience Overlays

Store audience-specific overlays separately from the core profile. Each generated variant selects
exactly one overlay.

Suggested initial overlays:

- `agencies`
- `in-house-social-teams`
- `smb-marketing-teams`

Suggested fields:

- `audienceLabel`
- `primaryPains`
- `desiredOutcomes`
- `topObjections`
- `decisionCriteria`
- `proofExpectations`
- `ctaPreference`
- `productFocusAreas`
- `faqConcerns`
- `preferredToneAdjustments`

Overlays change both messaging and section emphasis, but they do not replace the shared product
core.

### Homepage Archetypes

Define a small set of tightly curated archetypes. These are the main structural and persuasive
templates used by the generator.

Suggested initial archetypes:

- `workflow-story`
- `proof-first`
- `comparison-led`
- `product-demo-first`

Suggested fields:

- `id`
- `label`
- `heroGoal`
- `narrativeOrder`
- `requiredSections`
- `optionalSections`
- `proofPlacement`
- `ctaStyle`
- `compatiblePromiseAngles`
- `compatibleProofStrategies`
- `compatibleCreativeBundles`

Archetypes are the main mechanism for changing page structure and persuasive flow.

### Promise Angles

Define reusable promise angles that can be paired with compatible archetypes and audiences.

Suggested fields:

- `id`
- `label`
- `corePromise`
- `bestFitAudiences`
- `bestFitArchetypes`
- `headlineDirection`
- `supportingMessageThemes`

Promise angles ensure the hero and page narrative are built around a concrete outcome instead of a
generic product description.

### Proof Strategies

Define reusable proof strategies that control how credibility is established on the page.

Suggested fields:

- `id`
- `label`
- `proofType`
- `bestFitAudiences`
- `bestFitArchetypes`
- `recommendedProofElements`
- `proofPlacementGuidance`

Proof strategies ensure the page does not treat social proof as an interchangeable section, but as
an intentional persuasion device tailored to the audience and page structure.

### Creative Direction Bundles

Replace independent style-axis selection with curated bundles. A bundle describes a compatible
visual direction rather than a bag of disconnected labels.

Suggested fields:

- `id`
- `heroStyle`
- `visualDensity`
- `motionBehavior`
- `colorDirection`
- `surfaceTreatment`
- `screenshotTreatment`
- `copyTone`
- `compatibilityTags`

The generator should select a bundle that is compatible with the chosen archetype and audience.

## Generation Rules

Each variant should be generated using the following sequence:

1. Select one audience overlay.
2. Select one homepage archetype compatible with that overlay.
3. Select one promise angle compatible with both the overlay and archetype.
4. Select one proof strategy compatible with both the overlay and archetype.
5. Select one creative direction bundle compatible with the archetype and overlay.
6. Select references or inspiration sources that support the chosen bundle.
7. Render a prompt containing both strategic and visual instructions.

The generator should prefer quality over randomness. It should avoid independent sampling where
that can create combinations that feel stylish but strategically mismatched.

## Prompt Contract

Each generated prompt should be reorganized into a strategy-first contract.

### Variant Metadata

Every prompt should expose the following metadata near the top:

- variant index
- seed
- audience overlay
- homepage archetype
- promise angle
- proof strategy
- creative direction bundle

This metadata should also be written to the manifest.

### System Prompt

Keep the strong quality bar, but add explicit anti-generic rules:

- no vague AI-productivity filler
- no interchangeable SaaS headline language
- hero must make a concrete promise to the selected audience
- proof must match the selected audience and archetype
- product visuals must show a believable social publishing workflow
- copy must avoid generic verbs like `streamline`, `optimize`, and `unlock` unless grounded in a
  concrete outcome

### Planning Before Implementation

Require the model to think before coding. The prompt should explicitly force this order:

1. Define homepage concept
2. Define messaging strategy
3. Define section-by-section narrative
4. Define visual direction rationale
5. Implement the homepage

This reasoning and implementation should still happen in a single response so the factory remains
practical to use.

### Product Core Block

Inject the shared PublyApp product core into every prompt.

### Audience Overlay Block

Inject the chosen audience overlay into every prompt. This changes pains, objections, desired
outcomes, and proof expectations.

### Archetype Brief

Inject the selected archetype into every prompt. This determines narrative order, hero framing,
section emphasis, proof placement, and CTA style.

### Creative Direction Block

Describe the chosen creative direction bundle in concrete terms. Avoid shallow labels alone.

Example expectations:

- how bold or restrained the layout should feel
- how screenshots should be framed
- how motion should behave
- how much contrast and texture should be used
- what the tone should feel like visually

### Output Contract

Require the response to include:

1. concise concept summary
2. messaging strategy summary
3. section outline
4. full homepage implementation
5. short quality self-check covering accessibility, responsiveness, and non-generic quality

## Manifest Changes

The manifest should evolve from simple style logging into variant review metadata.

Add fields for:

- audience overlay
- homepage archetype
- promise angle
- proof strategy
- creative direction bundle
- selected references

This makes batch review faster and allows winning directions to be analyzed and iterated.

## File and Structure Changes

Suggested structural direction:

- keep the generator entry point
- replace the current inspiration bank with a richer structured data source, or split it into
  multiple JSON files if that improves maintainability

Possible layout:

- `scripts/generate-homepage-prompts.mjs`
- `scripts/homepage-factory/product-core.json`
- `scripts/homepage-factory/audience-overlays.json`
- `scripts/homepage-factory/homepage-archetypes.json`
- `scripts/homepage-factory/promise-angles.json`
- `scripts/homepage-factory/proof-strategies.json`
- `scripts/homepage-factory/creative-bundles.json`

The exact file split can be chosen during implementation, but the conceptual split should remain.

## Testing Strategy

Add focused tests around generator behavior.

Required test coverage:

- deterministic output for a fixed seed
- one audience overlay per variant
- one archetype per variant
- only compatible promise/proof/creative combinations are emitted
- prompt output contains the new strategy-first sections
- manifest contains the new metadata fields

If the repo has no existing lightweight test harness for this script, use the smallest practical
approach that still verifies deterministic generation and compatibility enforcement.

## Migration Strategy

1. Introduce the new structured data files.
2. Refactor generator selection logic to use archetypes and compatibility rules.
3. Rewrite prompt template around the new prompt contract.
4. Enrich the manifest output.
5. Regenerate a small review batch and manually inspect quality.
6. Update README documentation to explain the new model and workflow.

## Acceptance Criteria

The redesign is successful when:

- every generated variant has a clear strategic identity beyond visual style
- variants target one primary audience each
- variants differ meaningfully in page flow and persuasion strategy
- prompts include explicit PublyApp-specific selling context
- generated prompts force concept and messaging decisions before implementation
- the manifest exposes enough metadata to compare batches intelligently
- average output quality improves even if raw randomness decreases

## Risks and Mitigations

- Risk: too much structure reduces exploration.
  Mitigation: keep multiple archetypes and multiple compatible creative bundles per archetype.

- Risk: structured data becomes verbose and hard to maintain.
  Mitigation: keep the number of archetypes and overlays intentionally small at first.

- Risk: the prompt becomes too long.
  Mitigation: keep product core concise and move only the highest-leverage facts into each prompt.

- Risk: variants still converge visually.
  Mitigation: ensure creative bundles differ in layout density, screenshot treatment, and motion
  posture, not just color labels.

## Recommendation

Implement the redesign as a curated archetype factory with:

- one shared PublyApp core profile
- one audience overlay per variant
- a small set of tightly curated archetypes
- compatibility-filtered creative direction bundles
- a prompt contract that requires concept, strategy, narrative, and then implementation

This is the best balance between exploration and consistently high homepage quality.
