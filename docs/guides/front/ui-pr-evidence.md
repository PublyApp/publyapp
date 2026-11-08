# UI PR evidence: annotated screenshots and prototype fidelity

Owner rules. They apply to every PR that changes something visible in `apps/front`.

## 1. Annotated screenshots on every UI PR

- **What:** PNG captures of every changed screen and scenario: states (loading, empty, error, data),
  light and dark when the change touches colour, desktop and 390 px mobile when the layout changes.
  French UI (cookie `publyapp-locale=fr`).
- **Annotations:** red frames, red arrows and red numbered circles on what changed. Each PNG has a
  one-line French caption.
- **Where:** pushed to the orphan `pr-screenshots` branch, one folder per PR, and posted as one PR comment
  with the images linked by their raw URL.
- **When:** the capture work starts the moment the PR opens (the PR body says « captures en cours »).
  The comment is posted **before** anyone asks for the merge. A UI PR without it is not mergeable.

## 2. Prototype fidelity for redesign screens

A screen that implements a prototype (the admin redesign, for example) is measured against it
**before the code review**. Code reviews read code, not the screen: on #2339, four approved code
reviews shipped a dashboard the owner found « complètement à côté de la plaque ».

Method:

1. **Same data on both sides.** The measuring script (outside the product code) answers the app's API
   calls with the prototype's figures through Playwright `page.route`, so layout is compared, not data.
2. **Measure each block pair** (prototype selector ↔ app selector) at 1440×900. Measure the bounding
   box and the computed font-size, font-weight, line-height, letter-spacing, text-transform, colour,
   background, border (width, colour, radius), padding, gap and shadow, plus the label texts.
3. **Score** = properties within tolerance / all properties. Tolerances:
   - sizes and positions: ±2 px, relative to the content column;
   - colours: identical once resolved to rgb;
   - fonts and texts: identical.
   **Target ≥ 97 % per screen, and zero gap on the key blocks** (KPI cards, filters, card headers).
4. **Loop fix → re-measure** until the target is met. A remaining gap stays only with a written reason:
   the prototype cannot be reproduced with real data, or a repo rule forbids it (cite the rule).
   « Not worth it » is not a reason.
5. Check placeholder states (skeletons, « no data yet » ghosts) keep the real block's size (±2 px),
   dark mode, and 390 px mobile with no overflow.
6. **Proof on the PR:** side-by-side captures (« Application » left, « Maquette » right) for each
   screen, plus the score table.

No code review is dispatched, and no merge is requested, on a redesign screen without the score and
the side-by-side captures.
