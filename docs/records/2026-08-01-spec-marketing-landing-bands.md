# Marketing Landing Bands Design

## Scope

Add the three held-back bands to `apps/front/src/routes/index.tsx` without restructuring the existing landing sections:

1. An always-on pricing band with the three beta tiers.
2. A customer-logo band behind `FEATURES.marketing.customerLogos`, default off.
3. A social-proof stat band behind `FEATURES.marketing.socialProof`, default off.

The implementation stays in the shipped `apps/front` app. `apps/old-front` is out of scope.

## Rendering design

The page keeps its current hero → claims → tour → bento → timeline → FAQ → closing flow. The new sections are inserted together immediately before the FAQ, leaving all existing section bodies unchanged. Pricing always renders. The two proof sections use a conditional expression that returns `null` when their own flag is false, so an off band contributes no DOM, heading, divider, or spacing.

Pricing is represented by a small typed array in `index.tsx`. Each card has a translated name, price, description, CTA, and optional badge key. The numeric price is the only child of `<del>`; the translated `/ month` suffix and the separate `free while in beta` note are outside it. Every CTA uses `/signup`, including Network's `Talk to us`, because the route table contains no contact route.

The logo and stat content are also key arrays in the same route. Logo entries are plain text names with no avatars or people. The six supplied company names remain exactly as given and are only exposed when the logo flag is enabled.

## Flags

`apps/front/src/lib/flags.ts` gains a `marketing` group inside the frozen `FEATURES` object:

- `customerLogos: readFlag('VITE_FEATURE_MARKETING_CUSTOMER_LOGOS', false)`;
- `socialProof: readFlag('VITE_FEATURE_MARKETING_SOCIAL_PROOF', false)`.

Each entry has a short comment explaining that the corresponding proof is not ready to publish. The flags are read at module load, and the landing tests use the existing hoisted mutable getter mock pattern so each test can set a flag without weakening assertions.

## i18n and styling

All visible copy receives a `landing-` key in both common locale files. French uses translated copy, including “permissions par action” for the Agency description. Locale key sets remain identical. The implementation uses only the existing page's named design-token classes and no new CSS tokens, raw colors, inline styles, images, avatars, or personal names.

## Verification design

The route test suite adds one pricing test and separate off/on tests for each flagged band. Off tests assert `queryByTestId(...)` is `null`; on tests assert the section and its content exist. The pricing test asserts all three cards, all three `<del>` price nodes, three independent beta notes, and all CTA targets. Each new test is run once with the covered behavior deliberately broken and once after restoration; those red/green transcripts are recorded in `.dump/report.md`. The final committed state is checked with the requested front test, typecheck, build, and changed-file oxlint commands.


