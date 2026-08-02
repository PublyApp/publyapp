/**
 * The page-wide atmospheric wash (PROMPT.md §1.7) — one absolutely
 * positioned, decorative gradient behind everything, replacing the missing
 * imagery in the open half of the page. Dies out by ~42% of its own height,
 * somewhere inside D1, so the dense half of the page sits on a plain
 * background. Purely decorative: `aria-hidden`, no text, no i18n key.
 */
export const LandingPageWash = () => (
	<div aria-hidden="true" className="publy-landing-06-page-wash" />
);
