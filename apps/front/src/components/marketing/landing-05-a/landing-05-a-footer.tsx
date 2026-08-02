import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { MarketingBrand } from '../marketing-brand';

/**
 * The direction's own footer — a designed surface, not a sitemap dump. It is
 * the last thing in a reader's memory and it was the page's thinnest moment:
 * a wordmark, five links strung along one line, and a yellow Sign-up button
 * sitting directly under the closing band's yellow Sign-up button.
 *
 * Four decisions:
 *
 * 1. It sits IN the atmosphere. The sky now spans the whole document, so the
 *    footer is inside the dusk's last light rather than on plain background
 *    below it — one hairline rule separates it, never a filled band, the same
 *    "a rule instead of a seam" discipline the ruled column uses throughout.
 *
 * 2. TWO-TONE HIERARCHY, inverted (todesktop-34). The group titles are the
 *    faintest rank on the page and the links are full-strength foreground,
 *    because in a footer you are looking for a destination, not a category.
 *
 * 3. NO CTA. The closing band immediately above ends on a primary button; a
 *    second one 100px later is not a second chance, it is a repeat. The
 *    footer's job is destinations, so "Sign up" is a link here like any
 *    other.
 *
 * 4. EVERY DESTINATION IS REAL. Two groups, five links, all of them resolve:
 *    three in-page anchors and two routes. There is no Company column, no
 *    Legal column, no Changelog — inventing plausible footer columns for
 *    routes that do not exist is the same failure as inventing a customer
 *    logo, and the page refuses both.
 *
 * The grid drops to a single stacked column below 768 rather than reflowing
 * two 3-track groups into something narrower than their own labels.
 */
const FOOTER_LINK_CLASS =
	'publy-l05a-pressable publy-l05a-focus-ring publy-l05a-underline publy-type-sky-label -mx-2 inline-flex w-fit rounded-[var(--publy-radius-small-control)] px-2 py-1 text-(--publy-foreground)';

export const Landing05AFooter = () => {
	const { t } = useTranslation('landing-05-a');
	const year = new Date().getFullYear();

	return (
		<footer
			data-testid="landing-05-a-footer"
			className="relative mt-auto border-t border-(--publy-border)"
		>
			<div className="publy-l05a-ruled-column px-4 py-12 sm:px-6 sm:py-16">
				<div className="grid gap-12 md:grid-cols-12 md:gap-8">
					<div className="md:col-span-5">
						<MarketingBrand size="lg" />
						<p className="publy-type-sky-body mt-4 max-w-[36ch] text-pretty text-(--publy-foreground-secondary)">
							{t('landing-footer-line')}
						</p>
					</div>
					<nav
						aria-label={t('landing-footer-nav-aria-label')}
						className="grid grid-cols-2 gap-8 md:col-span-6 md:col-start-7"
					>
						<div className="flex flex-col gap-3">
							<p className="publy-type-sky-label text-(--publy-foreground-subtle)">
								{t('landing-footer-group-page')}
							</p>
							<a href="#product-window" className={FOOTER_LINK_CLASS}>
								{t('landing-nav-product')}
							</a>
							<a href="#pricing" className={FOOTER_LINK_CLASS}>
								{t('landing-nav-pricing')}
							</a>
							<a href="#faq" className={FOOTER_LINK_CLASS}>
								{t('landing-nav-faq')}
							</a>
						</div>
						<div className="flex flex-col gap-3">
							<p className="publy-type-sky-label text-(--publy-foreground-subtle)">
								{t('landing-footer-group-account')}
							</p>
							<Link to="/login" className={FOOTER_LINK_CLASS}>
								{t('landing-nav-login')}
							</Link>
							<Link to="/signup" className={FOOTER_LINK_CLASS}>
								{t('landing-nav-cta')}
							</Link>
						</div>
					</nav>
				</div>
				<p className="publy-type-helper mt-12 border-t border-(--publy-border) pt-8">
					{t('landing-footer-copyright', { year })}
				</p>
			</div>
		</footer>
	);
};
