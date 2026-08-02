import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CookiePrefsDrawer } from '~/components/marketing/cookie-prefs-drawer';
import { Landing05AAudience } from '~/components/marketing/landing-05-a/landing-05-a-audience';
import { Landing05ACapabilities } from '~/components/marketing/landing-05-a/landing-05-a-capabilities';
import { Landing05AClaims } from '~/components/marketing/landing-05-a/landing-05-a-claims';
import { Landing05ACookieBand } from '~/components/marketing/landing-05-a/landing-05-a-cookie-band';
import { Landing05AFaq } from '~/components/marketing/landing-05-a/landing-05-a-faq';
import { Landing05AFooter } from '~/components/marketing/landing-05-a/landing-05-a-footer';
import { Landing05AHeader } from '~/components/marketing/landing-05-a/landing-05-a-header';
import { Landing05APricing } from '~/components/marketing/landing-05-a/landing-05-a-pricing';
import { Landing05ASection } from '~/components/marketing/landing-05-a/landing-05-a-section';
import { Landing05ASectionHeader } from '~/components/marketing/landing-05-a/landing-05-a-section-header';
import { Landing05ASky } from '~/components/marketing/landing-05-a/landing-05-a-sky';
import { Landing05ATour } from '~/components/marketing/landing-05-a/landing-05-a-tour';
import { Landing05ATrial } from '~/components/marketing/landing-05-a/landing-05-a-trial';
import { buttonVariants } from '~/components/ui/button';
import { FEATURES } from '~/lib/flags';
import { cn } from '~/lib/utils';

/* §9 — the two flag-gated bands: restyled onto the shared attio-15 hairline
   grid, flags left off in every released image (no Dockerfile ARG exists). */
const CUSTOMER_LOGO_KEYS = [
	'landing-customer-logo-northbeam',
	'landing-customer-logo-halcyon',
	'landing-customer-logo-fieldnote',
	'landing-customer-logo-studio-mera',
	'landing-customer-logo-orrery',
	'landing-customer-logo-caldera',
] as const;

const SOCIAL_PROOF_KEYS = [
	'landing-social-proof-rating',
	'landing-social-proof-brands',
	'landing-social-proof-setup',
] as const;

export const Route = createFileRoute('/temp/landing-05-a')({
	component: LandingExploration05A,
	staticData: { i18nNamespaces: ['landing-05-a'], crumbs: 'shell' },
});

/**
 * 05-A — THE SKY, REFINED: header through the footer.
 *
 * `__root.tsx`'s `isLandingExplorationPath` branch renders every /temp/
 * landing route bare — no `MarketingLayout`, so no shared header/footer and
 * no inherited `MarketingContainer` inset. This direction therefore owns its
 * whole shell: `Landing05AHeader` and `Landing05AFooter` (own files, own
 * `.publy-landing-05-a`-scoped styling) bracket a `<main>` that carries one
 * continuous atmosphere (`Landing05ASky`) behind a single ruled column; every
 * section below opens with its own chip → H2 → dek triple (§2.6) and hands
 * its body to a dedicated component.
 */
function LandingExploration05A() {
	const { t } = useTranslation('landing-05-a');
	const [isCookiePrefsOpen, setIsCookiePrefsOpen] = useState(false);

	return (
		<div
			data-testid="landing-05-a-page"
			className="publy-landing-05-a flex min-h-dvh flex-col"
		>
			{/* Keyboard order is skip link → header → main → footer. Invisible
			    until focused; a keyboard user tabbing in from the address bar
			    can jump straight past the header/nav repetition. */}
			<a
				href="#landing-05-a-main"
				className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-(--publy-z-toast) focus-visible:rounded-[var(--publy-radius-small-control)] focus-visible:bg-(--publy-surface) focus-visible:px-4 focus-visible:py-2 focus-visible:text-(--publy-foreground) focus-visible:no-underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
			>
				{t('landing-skip-to-content')}
			</a>
			<Landing05AHeader />
			<main
				id="landing-05-a-main"
				// -1: not in the tab order, but programmatically focusable so
				// the skip link above actually moves focus here rather than
				// only scrolling — a hash jump to a non-focusable target
				// leaves focus stranded at the top of the document.
				tabIndex={-1}
				className="relative isolate flex-1 overflow-x-clip outline-none"
			>
				<Landing05ASky />
				{/* Later positioned sibling of the sky: paints above it by DOM
				    order — no z-index anywhere on the page. */}
				<div className="relative">
					<div className="publy-l05a-ruled-column">
						{/* §1 — Hero: type on the gradient, nothing else. */}
						<Landing05ASection
							variant="hero"
							labelledBy="landing-05-a-hero-heading"
							className="text-center"
						>
							<p className="publy-l05a-hero-badge mx-auto mb-8">
								{t('landing-hero-badge')}
							</p>
							<h1
								id="landing-05-a-hero-heading"
								data-testid="landing-hero-title"
								className="publy-type-sky-display-1 publy-sky-a-focus-in mx-auto max-w-[24ch] text-balance text-(--publy-foreground) md:max-w-[20ch]"
							>
								{t('landing-hero-title')}
							</h1>
							<p className="publy-type-sky-lead mx-auto mt-6 max-w-[52ch] text-pretty text-(--publy-foreground-secondary)">
								{t('landing-hero-description')}
							</p>
							<div className="mt-8 flex flex-wrap justify-center gap-3">
								<Link
									to="/signup"
									className={cn(
										buttonVariants({ variant: 'default', size: 'lg' }),
										'publy-l05a-pressable',
									)}
								>
									{t('landing-hero-primary-cta')}
								</Link>
								<a
									href="#product-window"
									className={cn(
										buttonVariants({ variant: 'outline', size: 'lg' }),
										'publy-l05a-pressable',
									)}
								>
									{t('landing-hero-secondary-cta')}
								</a>
							</div>
						</Landing05ASection>

						{/* §2 — The product window: one aperture over the bloom, and the
					    hero secondary CTA's anchor target. Unruled — hero and window
					    share one continuous stretch of field. */}
						<Landing05ASection
							variant="window"
							id="product-window"
							anchor
							labelledBy="landing-05-a-tour-heading"
						>
							<Landing05ATour />
						</Landing05ASection>

						{/* §3 — Three claims (attio-29 stat blocks). */}
						<Landing05ASection ruled labelledBy="landing-05-a-claim-heading">
							<Landing05ASectionHeader
								headingId="landing-05-a-claim-heading"
								eyebrowKey="landing-claim-eyebrow"
								titleKey="landing-claim-title"
								dekKey="landing-claim-dek"
							/>
							<Landing05AClaims />
						</Landing05ASection>

						{/* §4 — What ships today: the six-fact strip (todesktop-31). */}
						<Landing05ASection
							ruled
							labelledBy="landing-05-a-capability-heading"
						>
							<Landing05ASectionHeader
								headingId="landing-05-a-capability-heading"
								eyebrowKey="landing-capability-eyebrow"
								titleKey="landing-capability-title"
								dekKey="landing-capability-dek"
							/>
							<Landing05ACapabilities />
						</Landing05ASection>

						{/* §5 — Who it is for (attio-15 hairline grid + one side-pane slot). */}
						<Landing05ASection ruled labelledBy="landing-05-a-audience-heading">
							<Landing05ASectionHeader
								headingId="landing-05-a-audience-heading"
								eyebrowKey="landing-bento-eyebrow"
								titleKey="landing-bento-title"
								dekKey="landing-bento-dek"
							/>
							<Landing05AAudience />
						</Landing05ASection>

						{/* §6 — The planned trial: claim-gated, three steps. */}
						<Landing05ASection ruled labelledBy="landing-05-a-timeline-heading">
							<Landing05ASectionHeader
								headingId="landing-05-a-timeline-heading"
								eyebrowKey="landing-timeline-eyebrow"
								titleKey="landing-timeline-title"
								dekKey="landing-trial-plan-note"
								dekTestId="landing-trial-plan-note"
							/>
							<Landing05ATrial />
						</Landing05ASection>

						{/* §7 — Pricing: struck through, beta-noted, todesktop-23 framed. */}
						<Landing05ASection
							ruled
							id="pricing"
							anchor
							testId="landing-pricing"
							labelledBy="landing-05-a-pricing-heading"
						>
							<Landing05ASectionHeader
								headingId="landing-05-a-pricing-heading"
								eyebrowKey="landing-pricing-eyebrow"
								titleKey="landing-pricing-title"
								dekKey="landing-pricing-subtitle"
							/>
							<Landing05APricing />
						</Landing05ASection>

						{/* §8 — FAQ (todesktop-33, two columns). */}
						<Landing05ASection
							ruled
							id="faq"
							anchor
							labelledBy="landing-05-a-faq-heading"
						>
							<Landing05ASectionHeader
								headingId="landing-05-a-faq-heading"
								eyebrowKey="landing-faq-eyebrow"
								titleKey="landing-faq-title"
								dekKey="landing-faq-dek"
							/>
							<Landing05AFaq />
						</Landing05ASection>

						{/* §9 — The two flag-gated bands: restyled onto the attio-15
					    hairline grid, flags stay off in every released image (no
					    Dockerfile ARG exists). */}
						{FEATURES.marketing.customerLogos ? (
							<Landing05ASection
								ruled
								testId="landing-customer-logos"
								labelledBy="landing-05-a-logos-heading"
							>
								<h2
									id="landing-05-a-logos-heading"
									className="publy-type-sky-display-3 mx-auto max-w-[58ch] text-center text-balance text-(--publy-foreground)"
								>
									{t('landing-customer-logos-title')}
								</h2>
								<div className="publy-marketing-hairline-grid mt-7 grid grid-cols-2 sm:grid-cols-3">
									{CUSTOMER_LOGO_KEYS.map((logoKey) => (
										<div
											key={logoKey}
											className="flex min-h-16 items-center justify-center bg-(--publy-surface) px-4 text-center"
										>
											<span className="publy-type-sky-label text-(--publy-foreground-secondary)">
												{t(logoKey)}
											</span>
										</div>
									))}
								</div>
							</Landing05ASection>
						) : null}
						{FEATURES.marketing.socialProof ? (
							<section
								data-testid="landing-social-proof"
								className="publy-l05a-section publy-l05a-section-ruled"
							>
								<div className="publy-marketing-hairline-grid grid grid-cols-1 sm:grid-cols-3">
									{SOCIAL_PROOF_KEYS.map((proofKey) => (
										<p
											key={proofKey}
											className="publy-type-sky-label bg-(--publy-surface) px-6 py-5 text-center text-(--publy-foreground-secondary)"
										>
											{t(proofKey)}
										</p>
									))}
								</div>
							</section>
						) : null}

						{/* §10 — Closing: the night slice (todesktop-15) — one boxed slice
					    of the same sky, rotated 7° off vertical, theme-invariant. */}
						<Landing05ASection ruled labelledBy="landing-05-a-closing-heading">
							<div className="publy-marketing-night publy-l05a-radius-band relative isolate overflow-hidden px-6 py-14 text-center sm:px-12 md:py-16 lg:py-20">
								<p className="publy-marketing-eyebrow publy-l05a-eyebrow-chip-night mx-auto w-fit">
									{t('landing-closing-eyebrow')}
								</p>
								<h2
									id="landing-05-a-closing-heading"
									className="publy-type-sky-display-2 mx-auto mt-6 max-w-[18ch] text-balance text-(--l05a-night-foreground)"
								>
									{t('landing-closing-title')}
								</h2>
								<p className="publy-type-sky-lead mx-auto mt-3 max-w-[52ch] text-pretty text-(--l05a-night-foreground-muted)">
									{t('landing-closing-description')}
								</p>
								<div className="mt-8 flex flex-wrap justify-center gap-3">
									<Link
										to="/signup"
										className={cn(
											buttonVariants({ variant: 'default', size: 'lg' }),
											'publy-l05a-pressable',
										)}
									>
										{t('landing-closing-primary-cta')}
									</Link>
									<Link
										to="/login"
										className="publy-l05a-pressable inline-flex h-11 items-center justify-center rounded-[var(--publy-radius-control)] border border-(--l05a-night-hairline) px-6 text-sm font-medium text-(--l05a-night-foreground) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--publy-focus-ring)"
									>
										{t('landing-closing-secondary-cta')}
									</Link>
								</div>
							</div>
						</Landing05ASection>
					</div>
				</div>
			</main>
			<Landing05AFooter />
			<Landing05ACookieBand onCustomize={() => setIsCookiePrefsOpen(true)} />
			<CookiePrefsDrawer
				open={isCookiePrefsOpen}
				onOpenChange={setIsCookiePrefsOpen}
			/>
		</div>
	);
}
