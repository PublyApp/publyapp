/**
 * The page's one atmosphere (todesktop-14): a single absolutely positioned
 * gradient mounted once, behind everything the landing exploration renders.
 * No section owns a background — the dark-to-light transition happens across
 * section boundaries instead of at them, so there is never a seam. Light is
 * dawn, dark is dusk; both ramps, the full-bleed breakout and the 1900/2400px
 * heights live in `styles/landing-05-a.css` under `.publy-landing-05-a`.
 *
 * Decorative only, never content: hidden from the accessibility tree, and
 * pointer-events/selection are disabled in CSS. It carries no z-index — the
 * content column is a later positioned sibling, so it paints above the sky
 * by DOM order, and `isolate` on the root keeps the arrangement out of the
 * sticky header's stacking context.
 */
export const Landing05ASky = () => (
	<div aria-hidden="true" className="publy-marketing-sky" />
);
