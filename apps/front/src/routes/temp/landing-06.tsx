import { createFileRoute } from '@tanstack/react-router';
import { LandingCapabilityStrip } from '~/components/marketing/landing-06/landing-capability-strip';
import { LandingClosingCta } from '~/components/marketing/landing-06/landing-closing-cta';
import { LandingDifferentiators } from '~/components/marketing/landing-06/landing-differentiators';
import { LandingFaq } from '~/components/marketing/landing-06/landing-faq';
import { LandingFooter } from '~/components/marketing/landing-06/landing-footer';
import { LandingHeader } from '~/components/marketing/landing-06/landing-header';
import { LandingHero } from '~/components/marketing/landing-06/landing-hero';
import { LandingPageWash } from '~/components/marketing/landing-06/landing-page-wash';
import { LandingPricing } from '~/components/marketing/landing-06/landing-pricing';
import { LandingProductTour } from '~/components/marketing/landing-06/landing-product-tour';
import { LandingTierSection } from '~/components/marketing/landing-06/landing-tier-section';
import { LandingTimeline } from '~/components/marketing/landing-06/landing-timeline';
import { LandingWho } from '~/components/marketing/landing-06/landing-who';

export const Route = createFileRoute('/temp/landing-06')({
	component: LandingExploration06,
	staticData: { i18nNamespaces: ['landing-06'], crumbs: 'shell' },
});

/**
 * The census (PROMPT.md §3.1/§4–§12). Every entry inherits a single density
 * tier from `landing-06.css`'s `[data-tier]` ladder; `overlap` pulls a
 * section up by its own top padding (todesktop-20) so tier changes happen
 * inside a continuous surface, never at a seam. The closing CTA deliberately
 * breaks back to D1 — the one backward step on the page — and does not
 * overlap, so the frame visibly releases.
 *
 * Subtask 2/5 filled the hero, capability strip and product tour (see
 * .dump/report-t2.md). Subtask 3/5 (this one) fills everything from the
 * differentiators through the footer — see .dump/report-t3.md.
 */

function LandingExploration06() {
	return (
		<div
			data-testid="landing-06-page"
			className="publy-landing-06 flex min-h-dvh flex-col"
		>
			<LandingHeader />
			{/* The header goes `fixed` once condensed and leaves the flow; this
			    spacer reserves the space it occupied while `sticky`, so nothing
			    below jumps at the threshold (§2.2). */}
			<div aria-hidden="true" className="h-(--publy-header-height)" />
			<main
				id="landing-06-main"
				className="relative isolate flex-1 overflow-x-clip"
			>
				<LandingPageWash />
				<LandingTierSection
					id="hero"
					testId="landing-06-section-hero"
					tier="d0"
					anchor={false}
				>
					<LandingHero />
				</LandingTierSection>
				<LandingTierSection
					id="capabilities"
					testId="landing-06-section-capabilities"
					tier="d1"
					overlap
				>
					<LandingCapabilityStrip />
				</LandingTierSection>
				<LandingTierSection
					id="tour"
					testId="landing-06-section-tour"
					tier="d1"
				>
					<LandingProductTour />
				</LandingTierSection>
				<LandingTierSection
					id="differentiators"
					testId="landing-06-section-differentiators"
					tier="d2"
					band="inverted"
					overlap
				>
					<LandingDifferentiators />
				</LandingTierSection>
				<LandingTierSection id="who" testId="landing-06-section-who" tier="d2">
					<LandingWho />
				</LandingTierSection>
				<LandingTierSection
					id="timeline"
					testId="landing-06-section-timeline"
					tier="d3"
					overlap
				>
					<LandingTimeline />
				</LandingTierSection>
				<LandingTierSection
					id="pricing"
					testId="landing-06-section-pricing"
					tier="d3"
				>
					<LandingPricing />
				</LandingTierSection>
				<LandingTierSection
					id="faq"
					testId="landing-06-section-faq"
					tier="d4"
					overlap
				>
					<LandingFaq />
				</LandingTierSection>
				<LandingTierSection
					id="closing-cta"
					testId="landing-06-section-closing-cta"
					tier="d1"
				>
					<LandingClosingCta />
				</LandingTierSection>
			</main>
			<LandingFooter />
		</div>
	);
}
