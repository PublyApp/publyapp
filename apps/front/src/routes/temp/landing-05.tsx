import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Landing05Capabilities } from '~/components/marketing/landing-05/landing-05-capabilities';
import { Landing05Claims } from '~/components/marketing/landing-05/landing-05-claims';
import { Landing05Section } from '~/components/marketing/landing-05/landing-05-section';
import { Landing05Sky } from '~/components/marketing/landing-05/landing-05-sky';
import { Landing05Tour } from '~/components/marketing/landing-05/landing-05-tour';
import { buttonVariants } from '~/components/ui/button';
import { FEATURES } from '~/lib/flags';
import { cn } from '~/lib/utils';

export const Route = createFileRoute('/temp/landing-05')({
	component: LandingExploration05,
	staticData: { i18nNamespaces: ['landing-05'], crumbs: 'shell' },
});

/**
 * 05 — THE SKY: page skeleton (foundations only — section content lands in
 * the follow-up tasks).
 *
 * One continuous atmosphere (`Landing05Sky`) behind a single ruled column;
 * every section below is one empty frame — its id, testid, anchor class,
 * rhythm variant and real heading — that the content tasks fill. The chrome
 * (announcement bar, header/nav, footer, cookie surfaces) is the marketing
 * shell's own: `__root.tsx` wraps every marketing-surface route, this one
 * included, and the direction keeps that chrome untouched (prompt §0/§11),
 * so this page renders no chrome of its own.
 *
 * The shell wraps children in `MarketingContainer width="reading"` with
 * `py-10` and `px-4 sm:px-6`, and the shell is shared and off-limits. The
 * negative margins below neutralise exactly that inherited inset, so the
 * exploration's own geometry — the sky's full-bleed breakout, the 1152px
 * ruled column with its ≥1280 edge rules, the section gutters — renders at
 * the direction's measured numbers instead of 40px/16–24px inside them.
 */
function LandingExploration05() {
	const { t } = useTranslation('landing-05');

	return (
		<div className="publy-landing-05 relative isolate -mx-4 -mt-10 -mb-10 sm:-mx-6">
			<Landing05Sky />
			{/* Later positioned sibling of the sky: paints above it by DOM
			    order — no z-index anywhere on the page. */}
			<div className="relative">
				<div className="publy-l05-ruled-column">
					{/* §1 — Hero: type on the gradient, nothing else. */}
					<Landing05Section
						variant="hero"
						labelledBy="landing-05-hero-heading"
						className="text-center"
					>
						<p className="publy-l05-hero-badge mx-auto mb-9">
							{t('landing-hero-badge')}
						</p>
						<h1
							id="landing-05-hero-heading"
							data-testid="landing-hero-title"
							className="publy-type-sky-display-1 publy-sky-focus-in mx-auto max-w-[46ch] text-balance text-(--publy-foreground)"
						>
							{t('landing-hero-title')}
						</h1>
						<p className="publy-type-sky-lead mx-auto mt-4 max-w-[58ch] text-pretty text-(--publy-foreground-secondary)">
							{t('landing-hero-description')}
						</p>
						<div className="mt-8 flex flex-wrap justify-center gap-3">
							<Link
								to="/signup"
								className={cn(
									buttonVariants({ variant: 'default', size: 'lg' }),
									'publy-l05-pressable',
								)}
							>
								{t('landing-hero-primary-cta')}
							</Link>
							<a
								href="#product-window"
								className={cn(
									buttonVariants({ variant: 'outline', size: 'lg' }),
									'publy-l05-pressable',
								)}
							>
								{t('landing-hero-secondary-cta')}
							</a>
						</div>
					</Landing05Section>

					{/* §2 — The product window: one aperture over the bloom, and the
					    hero secondary CTA's anchor target. Unruled — hero and window
					    share one continuous stretch of field. */}
					<Landing05Section
						variant="window"
						id="product-window"
						anchor
						labelledBy="landing-05-tour-heading"
					>
						<Landing05Tour />
					</Landing05Section>

					{/* §3 — Three claims (attio-29 stat blocks). */}
					<Landing05Section ruled labelledBy="landing-05-claim-heading">
						<p className="publy-marketing-eyebrow publy-l05-eyebrow-chip">
							{t('landing-claim-eyebrow')}
						</p>
						<h2
							id="landing-05-claim-heading"
							className="publy-type-sky-display-2 mt-6 text-balance text-(--publy-foreground)"
						>
							{t('landing-claim-title')}
						</h2>
						<Landing05Claims />
					</Landing05Section>

					{/* §4 — What ships today: the six-fact strip (todesktop-31). */}
					<Landing05Section ruled labelledBy="landing-05-capability-heading">
						<p className="publy-marketing-eyebrow publy-l05-eyebrow-chip">
							{t('landing-capability-eyebrow')}
						</p>
						<h2
							id="landing-05-capability-heading"
							className="publy-type-sky-display-2 mt-6 text-balance text-(--publy-foreground)"
						>
							{t('landing-capability-title')}
						</h2>
						<Landing05Capabilities />
					</Landing05Section>

					{/* §5 — Who it is for (attio-15 hairline grid + one side-pane slot). */}
					<Landing05Section ruled labelledBy="landing-05-audience-heading">
						<h2
							id="landing-05-audience-heading"
							className="publy-type-sky-display-2 text-balance text-(--publy-foreground)"
						>
							{t('landing-bento-title')}
						</h2>
					</Landing05Section>

					{/* §6 — The planned trial: claim-gated, three steps. */}
					<Landing05Section ruled labelledBy="landing-05-timeline-heading">
						<h2
							id="landing-05-timeline-heading"
							className="publy-type-sky-display-2 text-balance text-(--publy-foreground)"
						>
							{t('landing-timeline-title')}
						</h2>
					</Landing05Section>

					{/* §7 — Pricing: struck through, beta-noted, todesktop-23 framed. */}
					<Landing05Section
						ruled
						testId="landing-pricing"
						labelledBy="landing-05-pricing-heading"
					>
						<h2
							id="landing-05-pricing-heading"
							className="publy-type-sky-display-2 text-balance text-(--publy-foreground)"
						>
							{t('landing-pricing-title')}
						</h2>
					</Landing05Section>

					{/* §8 — FAQ (todesktop-33, two columns). */}
					<Landing05Section
						ruled
						id="faq"
						anchor
						labelledBy="landing-05-faq-heading"
					>
						<h2
							id="landing-05-faq-heading"
							className="publy-type-sky-display-2 text-balance text-(--publy-foreground)"
						>
							{t('landing-faq-title')}
						</h2>
					</Landing05Section>

					{/* §9 — The two flag-gated bands: kept, restyle later, flags stay
					    off in every released image (no Dockerfile ARG exists). */}
					{FEATURES.marketing.customerLogos ? (
						<Landing05Section
							ruled
							testId="landing-customer-logos"
							labelledBy="landing-05-logos-heading"
						>
							<h2
								id="landing-05-logos-heading"
								className="publy-type-sky-display-2 text-balance text-(--publy-foreground)"
							>
								{t('landing-customer-logos-title')}
							</h2>
						</Landing05Section>
					) : null}
					{FEATURES.marketing.socialProof ? (
						<section
							data-testid="landing-social-proof"
							className="publy-l05-section publy-l05-section-ruled"
						/>
					) : null}

					{/* §10 — Closing: the night slice (todesktop-15) — one boxed slice
					    of the same sky, rotated 7° off vertical, theme-invariant. */}
					<Landing05Section ruled labelledBy="landing-05-closing-heading">
						<div className="publy-marketing-night publy-l05-radius-band relative isolate overflow-hidden px-6 py-14 text-center sm:px-12 lg:py-20">
							<h2
								id="landing-05-closing-heading"
								className="publy-type-sky-display-2 mx-auto max-w-[18ch] text-balance text-(--l05-night-foreground)"
							>
								{t('landing-closing-title')}
							</h2>
						</div>
					</Landing05Section>
				</div>
			</div>
		</div>
	);
}
