import { IconArrowNarrowDown } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Landing08Footer } from '~/components/marketing/landing-08/landing-08-footer';
import { Landing08Header } from '~/components/marketing/landing-08/landing-08-header';
import { Landing08Section } from '~/components/marketing/landing-08/landing-08-section';
import { MarketingContainer } from '~/components/marketing/marketing-container';
import { FEATURES } from '~/lib/flags';

export const Route = createFileRoute('/temp/landing-08')({
	component: LandingExploration08,
	staticData: { i18nNamespaces: ['landing-08'], crumbs: 'shell' },
});

/**
 * THE LONG FOLD — the page skeleton. One enormous typographic statement holds
 * the entire first screen, terminated by a 1px rule; the product is withheld
 * until the reader has scrolled past a commitment. Everything is flush left to
 * one vertical line — the reading column's content-box edge — with exactly one
 * centred element on the page (the closer's yellow field).
 *
 * This task ships the foundation and the section frames only: each section
 * renders its heading structure. Surface rows, claims, audience cells, the
 * price ledger, the trial sequence, the FAQ disclosures and both CTA rows land
 * with the content tasks.
 */
function LandingExploration08() {
	const { t } = useTranslation('landing-08');

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

						{/* The commitment. */}
						<Landing08Section
							eyebrow={t('landing-commitment-eyebrow')}
							heading={t('landing-commitment-statement')}
							headingVariant="display"
						/>

						{/* The surfaces. */}
						<Landing08Section
							id="surfaces"
							className="publy-marketing-anchor"
							eyebrow={t('landing-surfaces-eyebrow')}
							heading={t('landing-surfaces-title')}
						/>

						{/* What is different. */}
						<Landing08Section eyebrow={t('landing-claims-eyebrow')} />

						{FEATURES.marketing.customerLogos ? (
							<section
								data-testid="landing-customer-logos"
								className="publy-fold-section"
							>
								<p className="publy-type-marginal">
									{t('landing-customer-logos-title')}
								</p>
							</section>
						) : null}

						{FEATURES.marketing.socialProof ? (
							<section
								data-testid="landing-social-proof"
								className="publy-fold-section"
							/>
						) : null}

						{/* Who it is for. */}
						<Landing08Section
							eyebrow={t('landing-bento-eyebrow')}
							heading={t('landing-bento-title')}
						/>

						{/* The price ledger. */}
						<Landing08Section
							data-testid="landing-pricing"
							eyebrow={t('landing-pricing-subtitle')}
							heading={t('landing-pricing-title')}
						/>

						{/* What comes next. */}
						<Landing08Section
							eyebrow={t('landing-timeline-eyebrow')}
							heading={t('landing-timeline-title')}
						/>

						{/* Questions. */}
						<Landing08Section
							id="faq"
							className="publy-marketing-anchor"
							eyebrow={t('landing-faq-eyebrow')}
							heading={t('landing-faq-title')}
						/>

						{/* The close — the page's one centred element and its one yellow
						    field, promoted from a point to a field for exactly one block. */}
						<section className="publy-fold-section">
							<div className="publy-fold-closer rounded-[var(--publy-radius-control)] bg-(--publy-primary) px-6 py-14 text-center sm:px-12 sm:py-20 lg:px-16 lg:py-24">
								<h2 className="publy-type-title publy-fold-clip-mark mx-auto max-w-[18ch]">
									{t('landing-closing-title')}
								</h2>
							</div>
						</section>
					</div>
				</MarketingContainer>
			</main>
			<Landing08Footer />
		</div>
	);
}
