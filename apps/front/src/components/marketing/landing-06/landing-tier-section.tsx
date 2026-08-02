import type { ReactNode } from 'react';
import { MarketingContainer } from '~/components/marketing/marketing-container';
import { cn } from '~/lib/utils';

/**
 * One density tier, D0–D4 (PROMPT.md §1.4). Every section on the page
 * declares exactly one tier and inherits all of its values — grid inset,
 * vertical rhythm, gutter and hairline colour — through the `data-tier`
 * attribute selectors in `landing-06.css`. This is the single source of
 * truth for the ramp; no section hand-rolls its own spacing classes.
 */
export type LandingTier = 'd0' | 'd1' | 'd2' | 'd3' | 'd4';

/**
 * `inverted` wraps the tier in the dark-surface band used exactly once on
 * the finished page (§8.2, the differentiators section) — see the
 * `html:not(.dark) [data-band='inverted']` token re-scope in landing-06.css.
 */
export type LandingBand = 'plain' | 'inverted';

export type LandingTierSectionProps = {
	tier: LandingTier;
	id: string;
	testId: string;
	band?: LandingBand;
	/** todesktop-20: pull the section up by exactly its own top padding so
	 * adjacent tiers overlap with no visible seam. */
	overlap?: boolean;
	/** Clears the sticky/fixed header instead of hiding under it — see
	 * `.publy-marketing-anchor` in app.css. Only in-page jump targets need
	 * it, but it is harmless everywhere else. */
	anchor?: boolean;
	className?: string;
	children?: ReactNode;
};

export const LandingTierSection = ({
	tier,
	id,
	testId,
	band = 'plain',
	overlap = false,
	anchor = true,
	className,
	children,
}: LandingTierSectionProps) => (
	<section
		id={id}
		data-testid={testId}
		data-tier={tier}
		data-band={band}
		data-overlap={overlap ? 'true' : undefined}
		className={cn(
			'publy-landing-06-tier relative',
			anchor && 'publy-marketing-anchor',
			className,
		)}
	>
		<MarketingContainer width="chrome">
			<div className="publy-landing-06-tier-grid">
				<div className="publy-landing-06-tier-content">{children}</div>
			</div>
		</MarketingContainer>
	</section>
);
