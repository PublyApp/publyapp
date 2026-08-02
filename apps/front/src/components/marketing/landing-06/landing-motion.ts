/**
 * Asymmetric press (PROMPT.md §13.3, `todesktop-12`/`attio-17`): every
 * interactive element rides a slow release and a fast press — out on the
 * house `--publy-motion-medium` (240ms), in/active on the page's own 50ms
 * `--publy-landing-06-motion-press`. The page's own `Link`s use the
 * `.publy-landing-06-interactive` component class for this; the shared
 * `Button`/`buttonVariants` component (outside this directory, not owned by
 * this page) already ships `transition-all` at a flat duration, so its
 * timing can't be repointed from a `landing-06.css` rule — Tailwind's
 * utilities layer always wins over `@layer components` regardless of source
 * order. These `duration`/`ease` utilities land in that same utilities
 * layer, so they compose with (rather than lose to) the shared
 * `transition-all`, following Tailwind's own documented
 * `transition duration-* hover:duration-*` composition pattern.
 */
export const LANDING_06_PRESS_CLASSES =
	'duration-(--publy-motion-medium) ease-(--publy-motion-ease) hover:duration-(--publy-landing-06-motion-press) active:duration-(--publy-landing-06-motion-press)';
