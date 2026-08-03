import type { ReactNode } from 'react';
import { cn } from '~/lib/utils';

/**
 * The section frame for the exploration: one vertical-rhythm variant plus
 * the optional 1px rule that separates a section from the previous one
 * (attio-14 / padyna-01 — beneath the sky the page draws itself as a
 * document, so no section spends vertical whitespace on a divider it can
 * draw for free). Every number lives in `styles/landing-05-a.css`.
 *
 * Variants:
 * - `standard`: 72/48 → 96/56 → 120/64 (top/bottom) — todesktop-19's
 *   two-number discipline with attio-13's asymmetry: a section opens with
 *   roughly double the air it closes with, because the top padding separates
 *   from the previous section's content while the bottom only clears a rule.
 * - `hero`: follows the header, not a section (96/120/144 top), and closes at
 *   zero so the hero and the product window share one continuous unruled
 *   stretch of field — they are one statement.
 * - `window`: the first section below the first horizon, and the one that
 *   crosses it. Its top margin is a negative 40px — exactly the height of the
 *   product window's own title bar — so the bar rises into the dawn and the
 *   horizon rule runs out of its bottom edge. Large foot (120 → 160 bottom),
 *   so the floating cascade's 120px outer blur never lands on the next
 *   heading.
 * - `closing`: the only section inside the night. It opens on the second
 *   horizon rather than on a rule of its own, and closes on a foot deep
 *   enough that the ramp has room to darken before the footer takes it over.
 *
 * Horizontal gutters (16 → 24px) are part of the same classes: inside the
 * ruled column they are what insets content from the two vertical rules.
 *
 * Nothing leaves this frame. Every section on the page is the same width;
 * what varies is what a section IS, never how wide it is.
 */
const VARIANT_CLASS = {
	standard: 'publy-l05a-section',
	hero: 'publy-l05a-section-hero',
	window: 'publy-l05a-section-window',
	closing: 'publy-l05a-section-closing',
} as const;

type Landing05ASectionProps = {
	/** id of the heading element that names this section. */
	labelledBy: string;
	variant?: keyof typeof VARIANT_CLASS;
	/** 1px rule above — every section from §3 (claims) down. */
	ruled?: boolean;
	/** In-page anchor target: clears the sticky header on jump. */
	anchor?: boolean;
	/**
	 * Opt into the below-the-fold reveal (`use-l05a-reveal.ts`). Off for the
	 * hero and the product window, which carry their own entrance and are
	 * above the fold by construction.
	 */
	reveal?: boolean;
	id?: string;
	testId?: string;
	className?: string;
	children: ReactNode;
};

export const Landing05ASection = ({
	labelledBy,
	variant = 'standard',
	ruled = false,
	anchor = false,
	reveal = false,
	id,
	testId,
	className,
	children,
}: Landing05ASectionProps) => (
	<section
		id={id}
		data-testid={testId}
		data-l05a-reveal-target={reveal ? '' : undefined}
		aria-labelledby={labelledBy}
		className={cn(
			VARIANT_CLASS[variant],
			ruled && 'publy-l05a-section-ruled',
			anchor && 'publy-marketing-anchor',
			className,
		)}
	>
		{children}
	</section>
);
