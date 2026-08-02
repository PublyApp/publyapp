import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CookiePrefsDrawer } from '~/components/marketing/cookie-prefs-drawer';
import { Landing05Audience } from '~/components/marketing/landing-05/landing-05-audience';
import { Landing05Capabilities } from '~/components/marketing/landing-05/landing-05-capabilities';
import { Landing05Claims } from '~/components/marketing/landing-05/landing-05-claims';
import { Landing05CookieBand } from '~/components/marketing/landing-05/landing-05-cookie-band';
import { Landing05Faq } from '~/components/marketing/landing-05/landing-05-faq';
import { Landing05Footer } from '~/components/marketing/landing-05/landing-05-footer';
import { Landing05Header } from '~/components/marketing/landing-05/landing-05-header';
import { Landing05Pricing } from '~/components/marketing/landing-05/landing-05-pricing';
import { Landing05Section } from '~/components/marketing/landing-05/landing-05-section';
import { Landing05Sky } from '~/components/marketing/landing-05/landing-05-sky';
import { Landing05Tour } from '~/components/marketing/landing-05/landing-05-tour';
import { Landing05Trial } from '~/components/marketing/landing-05/landing-05-trial';
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

export const Route = createFileRoute('/temp/landing-05')({
	component: LandingExploration05,
	staticData: { i18nNamespaces: ['landing-05'], crumbs: 'shell' },
});

/**
 * 05 — THE SKY: header through the footer.
 *
 * `__root.tsx`'s `isLandingExplorationPath` branch renders every /temp/
 * landing route bare — no `MarketingLayout`, so no shared header/footer and
 * no inherited `MarketingContainer` inset. This direction therefore owns its
 * whole shell: `Landing05Header` and `Landing05Footer` (own files, own
 * `.publy-landing-05`-scoped styling) bracket a `<main>` that carries one
 * continuous atmosphere (`Landing05Sky`) behind a single ruled column; every
 * section below opens with its own chip → H2 → dek triple (§2.6) and hands
 * its body to a dedicated component.
 */
function LandingExploration05() {
	const { t } = useTranslation('landing-05');
	const [isCookiePrefsOpen, setIsCookiePrefsOpen] = useState(false);

	return (
		<div
			data-testid="landing-05-page"
			className="publy-landing-05 flex min-h-dvh flex-col"
		>
			{/* Keyboard order is skip link → header → main → footer. Invisible
			    until focused; a keyboard user tabbing in from the address bar
			    can jump straight past the header/nav repetition. */}
			<a
				href="#landing-05-main"
				className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-(--publy-z-toast) focus-visible:rounded-[var(--publy-radius-small-control)] focus-visible:bg-(--publy-surface) focus-visible:px-4 focus-visible:py-2 focus-visible:text-(--publy-foreground) focus-visible:no-underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
			>
				{t('landing-skip-to-content')}
			</a>
			<Landing05Header />
			<main
				id="landing-05-main"
				// -1: not in the tab order, but programmatically focusable so
				// the skip link above actually moves focus here rather than
				// only scrolling — a hash jump to a non-focusable target
				// leaves focus stranded at the top of the document.
				tabIndex={-1}
				className="relative isolate flex-1 overflow-x-clip outline-none"
			>
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
							<p className="publy-marketing-eyebrow publy-l05-eyebrow-chip">
								{t('landing-bento-eyebrow')}
							</p>
							<h2
								id="landing-05-audience-heading"
								className="publy-type-sky-display-2 mt-6 text-balance text-(--publy-foreground)"
							>
								{t('landing-bento-title')}
							</h2>
							<Landing05Audience />
						</Landing05Section>

						{/* §6 — The planned trial: claim-gated, three steps. */}
						<Landing05Section ruled labelledBy="landing-05-timeline-heading">
							<p className="publy-marketing-eyebrow publy-l05-eyebrow-chip">
								{t('landing-timeline-eyebrow')}
							</p>
							<h2
								id="landing-05-timeline-heading"
								className="publy-type-sky-display-2 mt-6 text-balance text-(--publy-foreground)"
							>
								{t('landing-timeline-title')}
							</h2>
							<Landing05Trial />
						</Landing05Section>

						{/* §7 — Pricing: struck through, beta-noted, todesktop-23 framed. */}
						<Landing05Section
							ruled
							id="pricing"
							anchor
							testId="landing-pricing"
							labelledBy="landing-05-pricing-heading"
						>
							<p className="publy-marketing-eyebrow publy-l05-eyebrow-chip">
								{t('landing-pricing-eyebrow')}
							</p>
							<h2
								id="landing-05-pricing-heading"
								className="publy-type-sky-display-2 mt-6 text-balance text-(--publy-foreground)"
							>
								{t('landing-pricing-title')}
							</h2>
							<p className="publy-type-sky-lead mt-3 max-w-[62ch] text-pretty text-(--publy-foreground-secondary)">
								{t('landing-pricing-subtitle')}
							</p>
							<Landing05Pricing />
						</Landing05Section>

						{/* §8 — FAQ (todesktop-33, two columns). */}
						<Landing05Section
							ruled
							id="faq"
							anchor
							labelledBy="landing-05-faq-heading"
						>
							<p className="publy-marketing-eyebrow publy-l05-eyebrow-chip">
								{t('landing-faq-eyebrow')}
							</p>
							<h2
								id="landing-05-faq-heading"
								className="publy-type-sky-display-2 mt-6 text-balance text-(--publy-foreground)"
							>
								{t('landing-faq-title')}
							</h2>
							<Landing05Faq />
						</Landing05Section>

						{/* §9 — The two flag-gated bands: restyled onto the attio-15
					    hairline grid, flags stay off in every released image (no
					    Dockerfile ARG exists). */}
						{FEATURES.marketing.customerLogos ? (
							<Landing05Section
								ruled
								testId="landing-customer-logos"
								labelledBy="landing-05-logos-heading"
							>
								<h2
									id="landing-05-logos-heading"
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
							</Landing05Section>
						) : null}
						{FEATURES.marketing.socialProof ? (
							<section
								data-testid="landing-social-proof"
								className="publy-l05-section publy-l05-section-ruled"
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
						<Landing05Section ruled labelledBy="landing-05-closing-heading">
							<div className="publy-marketing-night publy-l05-radius-band relative isolate overflow-hidden px-6 py-14 text-center sm:px-12 md:py-16 lg:py-20">
								<p className="publy-marketing-eyebrow publy-l05-eyebrow-chip-night mx-auto w-fit">
									{t('landing-closing-eyebrow')}
								</p>
								<h2
									id="landing-05-closing-heading"
									className="publy-type-sky-display-2 mx-auto mt-6 max-w-[18ch] text-balance text-(--l05-night-foreground)"
								>
									{t('landing-closing-title')}
								</h2>
								<p className="publy-type-sky-lead mx-auto mt-3 max-w-[54ch] text-pretty text-(--l05-night-foreground-muted)">
									{t('landing-closing-description')}
								</p>
								<div className="mt-8 flex flex-wrap justify-center gap-3">
									<Link
										to="/signup"
										className={cn(
											buttonVariants({ variant: 'default', size: 'lg' }),
											'publy-l05-pressable',
										)}
									>
										{t('landing-closing-primary-cta')}
									</Link>
									<Link
										to="/login"
										className="publy-l05-pressable inline-flex h-11 items-center justify-center rounded-[var(--publy-radius-control)] border border-(--l05-night-hairline) px-6 text-sm font-medium text-(--l05-night-foreground) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--publy-focus-ring)"
									>
										{t('landing-closing-secondary-cta')}
									</Link>
								</div>
							</div>
						</Landing05Section>
					</div>
				</div>
			</main>
			<Landing05Footer />
			<Landing05CookieBand onCustomize={() => setIsCookiePrefsOpen(true)} />
			<CookiePrefsDrawer
				open={isCookiePrefsOpen}
				onOpenChange={setIsCookiePrefsOpen}
			/>
		</div>
	);
}
