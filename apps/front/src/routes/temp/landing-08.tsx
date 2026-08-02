import { IconArrowNarrowDown } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { CookiePrefsDrawer } from '~/components/marketing/cookie-prefs-drawer';
import { Landing08Audience } from '~/components/marketing/landing-08/landing-08-audience';
import { Landing08Claims } from '~/components/marketing/landing-08/landing-08-claims';
import { Landing08CookieBand } from '~/components/marketing/landing-08/landing-08-cookie-band';
import { Landing08Faq } from '~/components/marketing/landing-08/landing-08-faq';
import { Landing08Footer } from '~/components/marketing/landing-08/landing-08-footer';
import { Landing08Header } from '~/components/marketing/landing-08/landing-08-header';
import { Landing08Pricing } from '~/components/marketing/landing-08/landing-08-pricing';
import { Landing08Section } from '~/components/marketing/landing-08/landing-08-section';
import { Landing08SurfacesList } from '~/components/marketing/landing-08/landing-08-surfaces-list';
import { Landing08Trial } from '~/components/marketing/landing-08/landing-08-trial';
import { MarketingContainer } from '~/components/marketing/marketing-container';
import { buttonVariants } from '~/components/ui/button';
import { FEATURES } from '~/lib/flags';
import { cn } from '~/lib/utils';

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

export const Route = createFileRoute('/temp/landing-08')({
	component: LandingExploration08,
	staticData: { i18nNamespaces: ['landing-08'], crumbs: 'shell' },
});

/**
 * THE LONG FOLD — one enormous typographic statement holds the entire first
 * screen, terminated by a 1px rule; the product is withheld until the reader
 * has scrolled past a commitment. Everything is flush left to one vertical
 * line — the reading column's content-box edge — with exactly one centred
 * element on the page (the closer's yellow field).
 */
function LandingExploration08() {
	const { t } = useTranslation('landing-08');
	const [isCookiePrefsOpen, setIsCookiePrefsOpen] = useState(false);

	return (
		<div className="publy-landing-08 flex min-h-dvh flex-col bg-(--publy-background)">
			<Landing08Header />
			<main className="flex-1">
				<MarketingContainer width="reading" className="py-10">
					<div className="flex flex-col">
						{/* The fold. Height-driven rather than padding-driven — the one
						    deliberate exception to the section rhythm. The flexible gap
						    lets the composition compress to the copy in longer locales
						    instead of overflowing it. */}
						<header className="publy-fold-screen flex flex-col pb-10">
							<div className="publy-marketing-fade-up flex items-center gap-2">
								<span
									aria-hidden="true"
									className="size-2 rounded-[var(--publy-radius-sm)] bg-(--publy-primary)"
								/>
								<span className="publy-type-mono">
									{t('landing-fold-eyebrow')}
								</span>
							</div>
							<h1
								className="publy-marketing-fade-up publy-type-fold publy-fold-clip publy-fold-cast mt-10 max-w-[9.6em] whitespace-pre-line"
								data-stagger="1"
							>
								{t('landing-fold-statement')}
							</h1>
							<p
								className="publy-marketing-fade-up publy-type-lede mt-12 max-w-[52ch]"
								data-stagger="2"
							>
								<Trans
									i18nKey="landing-fold-standfirst"
									ns="landing-08"
									components={{
										mark: <span className="publy-type-lede-mark" />,
									}}
								/>
							</p>
							<div
								className="publy-marketing-fade-up mt-14 flex flex-wrap items-center gap-3"
								data-stagger="3"
							>
								<Link
									to="/signup"
									className={cn(
										buttonVariants({ size: 'lg' }),
										'publy-fold-cta no-underline',
									)}
								>
									{t('landing-hero-primary-cta')}
								</Link>
								<a
									href="#surfaces"
									className={cn(
										buttonVariants({ variant: 'outline', size: 'lg' }),
										'publy-fold-cta no-underline',
									)}
								>
									{t('landing-fold-secondary-cta')}
								</a>
							</div>
							<div aria-hidden="true" className="min-h-16 flex-1" />
							<div
								className="publy-marketing-fade-up flex items-center justify-between gap-4 border-b border-(--publy-border) pb-4"
								data-stagger="4"
							>
								<a
									href="#surfaces"
									className="publy-type-mono inline-flex items-center gap-2 no-underline outline-none focus-visible:ring-3 focus-visible:ring-ring"
								>
									{t('landing-fold-scroll-cue')}
									<IconArrowNarrowDown aria-hidden="true" className="size-4" />
								</a>
							</div>
						</header>

						{/* The commitment. The 2px yellow rule is the third of the page's
						    four chromatic appearances — it marks this one sentence as the
						    page's thesis without a card, a background or a badge. */}
						<Landing08Section
							eyebrow={t('landing-commitment-eyebrow')}
							heading={t('landing-commitment-statement')}
							headingVariant="display"
						>
							<div
								aria-hidden="true"
								className="mt-8 h-0.5 w-24 bg-(--publy-primary)"
							/>
							<p className="publy-type-copy mt-8 max-w-[58ch]">
								{t('landing-commitment-body')}
							</p>
						</Landing08Section>

						{/* The surfaces — the only section carrying image slots. */}
						<Landing08Section
							id="surfaces"
							className="publy-marketing-anchor"
							eyebrow={t('landing-surfaces-eyebrow')}
							heading={t('landing-surfaces-title')}
						>
							<Landing08SurfacesList />
						</Landing08Section>

						{/* What is different — the three-claim fact strip. No heading,
						    only the eyebrow: the strip itself is the statement. */}
						<Landing08Section eyebrow={t('landing-claims-eyebrow')}>
							<Landing08Claims />
						</Landing08Section>

						{FEATURES.marketing.customerLogos ? (
							<section
								data-testid="landing-customer-logos"
								className="publy-fold-section"
							>
								<p className="publy-type-marginal">
									{t('landing-customer-logos-title')}
								</p>
								<div className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
									{CUSTOMER_LOGO_KEYS.map((key) => (
										<span key={key} className="publy-type-mono">
											{t(key)}
										</span>
									))}
								</div>
							</section>
						) : null}

						{FEATURES.marketing.socialProof ? (
							<section
								data-testid="landing-social-proof"
								className="publy-fold-section"
							>
								<div className="publy-marketing-hairline-grid grid grid-cols-1 sm:grid-cols-3">
									{SOCIAL_PROOF_KEYS.map((key) => (
										<p
											key={key}
											className="publy-type-marginal px-0 py-6 sm:px-6 sm:first:pl-0 sm:last:pr-0"
										>
											{t(key)}
										</p>
									))}
								</div>
							</section>
						) : null}

						{/* Who it is for. */}
						<Landing08Section
							eyebrow={t('landing-bento-eyebrow')}
							heading={t('landing-bento-title')}
						>
							<Landing08Audience />
						</Landing08Section>

						{/* The price ledger — struck-through prices, gated with the beta
						    note (no billing system runs today). */}
						<Landing08Section
							data-testid="landing-pricing"
							eyebrow={t('landing-pricing-subtitle')}
							heading={t('landing-pricing-title')}
						>
							<Landing08Pricing />
						</Landing08Section>

						{/* What comes next — the planned trial, hedged: never described
						    as running today. */}
						<Landing08Section
							eyebrow={t('landing-timeline-eyebrow')}
							heading={t('landing-timeline-title')}
						>
							<Landing08Trial />
						</Landing08Section>

						{/* Questions. */}
						<Landing08Section
							id="faq"
							className="publy-marketing-anchor"
							eyebrow={t('landing-faq-eyebrow')}
							heading={t('landing-faq-title')}
						>
							<Landing08Faq />
						</Landing08Section>

						{/* The close — the page's one centred element and its one yellow
						    field, promoted from a point to a field for exactly one block.
						    The primary CTA cannot be `variant="default"` here (yellow on
						    yellow is invisible): `secondary` resolves to
						    `--publy-surface-muted`, a neutral surface fill, which is the
						    condition F.10 sets for using it as-is. The secondary CTA
						    reuses `outline` with its fill, border and text repainted to
						    the closer's own ink token — the glass-on-a-coloured-card
						    pattern, reproduced in tokens rather than a new colour — and
						    the outline variant's own `dark:` classes are neutralised the
						    same way so the field reads identically in both themes. */}
						<section className="publy-fold-section">
							<div className="publy-fold-closer rounded-[var(--publy-radius-control)] bg-(--publy-primary) px-6 py-14 text-center sm:px-12 sm:py-20 lg:px-16 lg:py-24">
								<h2 className="publy-type-title publy-fold-clip-mark mx-auto max-w-[18ch]">
									{t('landing-closing-title')}
								</h2>
								<p className="publy-type-copy mx-auto mt-5 max-w-[56ch] text-(--publy-primary-foreground)">
									{t('landing-closing-description')}
								</p>
								<div className="mt-10 flex flex-wrap items-center justify-center gap-3">
									<Link
										to="/signup"
										className={cn(
											buttonVariants({ variant: 'secondary', size: 'lg' }),
											'publy-fold-cta no-underline',
										)}
									>
										{t('landing-hero-primary-cta')}
									</Link>
									<a
										href="#surfaces"
										className={cn(
											buttonVariants({ variant: 'outline', size: 'lg' }),
											'publy-fold-cta border-(--publy-primary-foreground) bg-(--publy-primary-foreground)/5 text-(--publy-primary-foreground) no-underline hover:bg-(--publy-primary-foreground)/10 hover:text-(--publy-primary-foreground) dark:bg-(--publy-primary-foreground)/5 dark:hover:bg-(--publy-primary-foreground)/10',
										)}
									>
										{t('landing-fold-secondary-cta')}
									</a>
								</div>
							</div>
						</section>
					</div>
				</MarketingContainer>
			</main>
			<Landing08Footer />
			<Landing08CookieBand onCustomize={() => setIsCookiePrefsOpen(true)} />
			<CookiePrefsDrawer
				open={isCookiePrefsOpen}
				onOpenChange={setIsCookiePrefsOpen}
			/>
		</div>
	);
}
