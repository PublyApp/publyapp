import { createFileRoute, Link } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CookiePrefsDrawer } from '~/components/marketing/cookie-prefs-drawer';
import { LandingAudience } from '~/components/marketing/landing/landing-audience';
import { LandingCapabilities } from '~/components/marketing/landing/landing-capabilities';
import { LandingClaims } from '~/components/marketing/landing/landing-claims';
import { LandingCookieBand } from '~/components/marketing/landing/landing-cookie-band';
import { LandingFaq } from '~/components/marketing/landing/landing-faq';
import { LandingFooter } from '~/components/marketing/landing/landing-footer';
import { LandingHeader } from '~/components/marketing/landing/landing-header';
import { LandingPricing } from '~/components/marketing/landing/landing-pricing';
import {
	LandingDawn,
	LandingDay,
	LandingNight,
} from '~/components/marketing/landing/landing-regions';
import { LandingSection } from '~/components/marketing/landing/landing-section';
import { LandingSectionHeader } from '~/components/marketing/landing/landing-section-header';
import { LandingTour } from '~/components/marketing/landing/landing-tour';
import { LandingTrial } from '~/components/marketing/landing/landing-trial';
import { useLandingReveal } from '~/components/marketing/landing/use-landing-reveal';
import { buttonVariants } from '~/components/ui/button.variants';
import { FEATURES } from '~/lib/flags';
import { createI18nFromResources } from '~/lib/i18n.shared';
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

/**
 * THE LANDING PAGE — "THE DAY": header through the footer.
 *
 * Chosen out of four explorations (#1082) and promoted to `/` from
 * `/temp/landing-05-a`; the other three directions and the whole `/temp/`
 * tree were deleted in the same change.
 *
 * IT OWNS ITS ENTIRE SHELL, and `__root.tsx` gives it none. Every other
 * marketing route is wrapped in `MarketingLayout` (shared header, footer and
 * container inset); this page is not, because its header and footer are part
 * of the design rather than chrome around it — `LandingHeader` and
 * `LandingFooter` (own files, own `.publy-landing`-scoped styling) bracket a
 * `<main>` built from three regions and the two horizons between them, see
 * `landing-regions.tsx`. That exemption lives in `__root.tsx` as
 * `isSelfShelledPath`; if this page ever adopts the shared shell, delete the
 * exemption rather than leaving it to match nothing.
 *
 * DAWN holds the hero and nothing else, for a full screen. The first HORIZON
 * is the dawn's own bottom edge, a hairline running the full width of the
 * viewport; the product window is pulled up by exactly the height of its
 * title bar so that the bar stands above the line and the horizon runs
 * straight out of it in both directions. DAY is paper: no field, one ruled
 * column, the entire argument, deliberately the flattest part of the page.
 * The second HORIZON opens NIGHT, which takes the closing argument and the
 * footer together and runs off the bottom of the document.
 */
const LandingPage = () => {
	const { t } = useTranslation('landing');
	const [isCookiePrefsOpen, setIsCookiePrefsOpen] = useState(false);
	const mainRef = useRef<HTMLElement>(null);

	// Below-the-fold reveal. Enhancement only: the server render is complete
	// and visible, and under reduced motion this attributes nothing at all.
	useLandingReveal(mainRef);

	return (
		<div
			data-testid="landing-page"
			className="publy-landing relative isolate flex min-h-dvh flex-col"
		>
			{/* Keyboard order is skip link → header → main → footer. Invisible
			    until focused; a keyboard user tabbing in from the address bar
			    can jump straight past the header/nav repetition. */}
			<a
				href="#landing-main"
				className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-(--publy-z-toast) focus-visible:rounded-[var(--publy-radius-small-control)] focus-visible:bg-(--publy-surface) focus-visible:px-4 focus-visible:py-2 focus-visible:text-(--publy-foreground) focus-visible:no-underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
			>
				{t('landing-skip-to-content')}
			</a>
			<LandingHeader />
			<main
				ref={mainRef}
				id="landing-main"
				// -1: not in the tab order, but programmatically focusable so
				// the skip link above actually moves focus here rather than
				// only scrolling — a hash jump to a non-focusable target
				// leaves focus stranded at the top of the document.
				tabIndex={-1}
				className="relative flex-1 overflow-x-clip outline-none"
			>
				{/* ---- DAWN. One statement, one screen, nothing else in it. The
				    hero is left-flush against the reading column's own edge, and
				    the right half of the sky is left empty on purpose: it is the
				    only place on the page where emptiness is the composition
				    rather than a gap between two things. */}
				<LandingDawn>
					<div className="publy-landing-ruled-column">
						<LandingSection variant="hero" labelledBy="landing-hero-heading">
							<p className="publy-landing-hero-badge mb-7">
								{t('landing-hero-badge')}
							</p>
							<h1
								id="landing-hero-heading"
								data-testid="landing-hero-title"
								className="publy-type-sky-display-1 publy-sky-focus-in publy-landing-optical-flush max-w-[15ch] text-balance text-(--publy-foreground)"
							>
								{t('landing-hero-title')}
							</h1>
							<p className="publy-type-sky-lead mt-8 max-w-[46ch] text-pretty text-(--publy-foreground-secondary)">
								{t('landing-hero-description')}
							</p>
							<div className="mt-10 flex flex-wrap gap-3">
								<Link
									to="/signup"
									className={cn(
										buttonVariants({ variant: 'default', size: 'lg' }),
										'publy-landing-pressable',
									)}
								>
									{t('landing-hero-primary-cta')}
								</Link>
								<a
									href="#product-window"
									className={cn(
										buttonVariants({ variant: 'outline', size: 'lg' }),
										'publy-landing-pressable',
									)}
								>
									{t('landing-hero-secondary-cta')}
								</a>
							</div>
						</LandingSection>
					</div>
				</LandingDawn>

				{/* ---- DAY. Paper. The whole argument, in one ruled column, with
				    no field behind it. */}
				<LandingDay>
					<div className="publy-landing-ruled-column">
						{/* §2 — The product window. It is the first thing below the
						    horizon and it is pulled up through it: `publy-landing-cross`
						    lifts the section by exactly the 40px of the window's own
						    title bar, so the bar stands in the dawn and the horizon
						    runs out of its bottom edge to both viewport edges. Also
						    the hero secondary CTA's anchor target. */}
						<LandingSection
							variant="window"
							id="product-window"
							anchor
							labelledBy="landing-tour-heading"
						>
							<LandingTour />
						</LandingSection>

						{/* §3 — Three claims (attio-29 stat blocks). */}
						<LandingSection reveal ruled labelledBy="landing-claim-heading">
							<LandingSectionHeader
								headingId="landing-claim-heading"
								eyebrowKey="landing-claim-eyebrow"
								titleKey="landing-claim-title"
								dekKey="landing-claim-dek"
							/>
							<LandingClaims />
						</LandingSection>

						{/* §4 — What ships today: the six-fact strip (todesktop-31). */}
						<LandingSection
							reveal
							ruled
							labelledBy="landing-capability-heading"
						>
							<LandingSectionHeader
								headingId="landing-capability-heading"
								eyebrowKey="landing-capability-eyebrow"
								titleKey="landing-capability-title"
								dekKey="landing-capability-dek"
							/>
							<LandingCapabilities />
						</LandingSection>

						{/* §5 — Who it is for (attio-15 hairline grid + one side-pane slot). */}
						<LandingSection reveal ruled labelledBy="landing-audience-heading">
							<LandingSectionHeader
								headingId="landing-audience-heading"
								eyebrowKey="landing-bento-eyebrow"
								titleKey="landing-bento-title"
								dekKey="landing-bento-dek"
							/>
							<LandingAudience />
						</LandingSection>

						{/* §6 — The planned trial: claim-gated, three steps. */}
						<LandingSection reveal ruled labelledBy="landing-timeline-heading">
							<LandingSectionHeader
								headingId="landing-timeline-heading"
								eyebrowKey="landing-timeline-eyebrow"
								titleKey="landing-timeline-title"
								dekKey="landing-trial-plan-note"
							/>
							<LandingTrial />
						</LandingSection>

						{/* §7 — Pricing: struck through, beta-noted, todesktop-23 framed. */}
						<LandingSection
							reveal
							ruled
							id="pricing"
							anchor
							testId="landing-pricing"
							labelledBy="landing-pricing-heading"
						>
							<LandingSectionHeader
								headingId="landing-pricing-heading"
								eyebrowKey="landing-pricing-eyebrow"
								titleKey="landing-pricing-title"
								dekKey="landing-pricing-subtitle"
							/>
							<LandingPricing />
						</LandingSection>

						{/* §8 — FAQ: ONE COLUMN, like every other section on the page.
					    The heading sits above the questions, full width; there is
					    no side rail, no split and no offset. */}
						<LandingSection
							reveal
							ruled
							id="faq"
							anchor
							labelledBy="landing-faq-heading"
						>
							<LandingSectionHeader
								headingId="landing-faq-heading"
								eyebrowKey="landing-faq-eyebrow"
								titleKey="landing-faq-title"
								dekKey="landing-faq-dek"
							/>
							<LandingFaq />
						</LandingSection>

						{/* §9 — The two flag-gated bands: restyled onto the attio-15
					    hairline grid, flags stay off in every released image (no
					    Dockerfile ARG exists). */}
						{FEATURES.marketing.customerLogos ? (
							<LandingSection
								reveal
								ruled
								testId="landing-customer-logos"
								labelledBy="landing-logos-heading"
							>
								<h2
									id="landing-logos-heading"
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
							</LandingSection>
						) : null}
						{FEATURES.marketing.socialProof ? (
							<section
								data-testid="landing-social-proof"
								className="publy-landing-section publy-landing-section-ruled"
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
					</div>
				</LandingDay>

				{/* ---- NIGHT, and the page's second horizon. The closing argument
				    used to be a 24px-radius box floating inside the column with
				    the footer on paper beneath it — a dark card, not an ending.
				    It is now the region itself: full-bleed, no radius, no
				    bracket, opening on the horizon rule and running off the
				    bottom of the document. The footer picks the same ramp up
				    where this hands it over, so the last thousand pixels of the
				    page are one object.

				    Left-flush, like everything above it. Centring the closing
				    band was the page's last disagreement with its own alignment:
				    a reader who has read one left edge for seven thousand pixels
				    does not want the final sentence somewhere else. */}
				<LandingNight>
					<div className="publy-landing-ruled-column">
						<LandingSection
							reveal
							variant="closing"
							labelledBy="landing-closing-heading"
						>
							<p className="publy-marketing-eyebrow publy-landing-eyebrow-chip-night w-fit">
								{t('landing-closing-eyebrow')}
							</p>
							<h2
								id="landing-closing-heading"
								className="publy-type-sky-display-2 publy-landing-optical-flush mt-7 max-w-[16ch] text-balance text-(--publy-foreground)"
							>
								{t('landing-closing-title')}
							</h2>
							<p className="publy-type-sky-lead mt-6 max-w-[52ch] text-pretty text-(--publy-foreground-secondary)">
								{t('landing-closing-description')}
							</p>
							<div className="mt-10 flex flex-wrap gap-3">
								<Link
									to="/signup"
									className={cn(
										buttonVariants({ variant: 'default', size: 'lg' }),
										'publy-landing-pressable',
									)}
								>
									{t('landing-closing-primary-cta')}
								</Link>
								<Link
									to="/login"
									className={cn(
										buttonVariants({ variant: 'outline', size: 'lg' }),
										'publy-landing-pressable',
									)}
								>
									{t('landing-closing-secondary-cta')}
								</Link>
							</div>
						</LandingSection>
					</div>
				</LandingNight>
			</main>
			<LandingFooter />
			<LandingCookieBand onCustomize={() => setIsCookiePrefsOpen(true)} />
			<CookiePrefsDrawer
				open={isCookiePrefsOpen}
				onOpenChange={setIsCookiePrefsOpen}
			/>
		</div>
	);
};

export const Route = createFileRoute('/')({
	component: LandingPage,
	staticData: { i18nNamespaces: ['landing'], crumbs: 'shell' },
	/**
	 * The document title and description, resolved in the reader's own
	 * locale.
	 *
	 * The root route declares only `charSet` and `viewport`, so every landing
	 * exploration inherits the app's default title — the last detail of a page
	 * a reader sees is the browser tab, and it was unset. `head` runs with the
	 * match's context, which is where the root's `beforeLoad` has already put
	 * the resolved locale and the loaded i18n resources, so the title and the
	 * description come out of the same bundle the page's copy does rather
	 * than out of a second, English-only source that would silently drift.
	 */
	head: ({ match }) => {
		const { locale, namespaces, resources } = match.context;
		const t = createI18nFromResources(locale, namespaces, resources).getFixedT(
			locale,
			'landing',
		);

		return {
			meta: [
				{ title: t('landing-meta-title') },
				{ name: 'description', content: t('landing-meta-description') },
			],
		};
	},
});
