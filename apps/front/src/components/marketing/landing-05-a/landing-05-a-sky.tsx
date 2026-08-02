/**
 * The page's one atmosphere (todesktop-14): a single absolutely positioned
 * element, mounted once, behind everything the landing exploration renders —
 * the header, the document and the footer. No section owns a background, so
 * every transition happens across section boundaries instead of at them and
 * there is never a seam.
 *
 * It spans the whole document (`inset: 0` on the page root) and carries two
 * px-anchored ramps in one `background-image`: a dawn anchored to the top
 * (1900/2400px) and a quieter dusk anchored to the bottom (900/1200px), with
 * the page background showing through the clear middle. That is what gives
 * the scroll a shape — warm, clear, warm — and what keeps the closing band
 * and the footer inside the atmosphere rather than on paper below it. Light
 * is dawn, dark is dusk; both ramps live in `styles/landing-05-a.css` under
 * `.publy-landing-05-a`.
 *
 * Decorative only, never content: hidden from the accessibility tree, and
 * pointer-events/selection are disabled in CSS. It carries no z-index — every
 * landmark is a later positioned sibling, so they paint above the sky by DOM
 * order, and `isolate` on the root keeps the arrangement out of the sticky
 * header's stacking context.
 */
export const Landing05ASky = () => (
	<div aria-hidden="true" className="publy-marketing-sky" />
);
