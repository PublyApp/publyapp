import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { MarketingBrand } from '../marketing-brand';
import { LandingNight } from './landing-regions';

/**
 * The direction's own footer — a designed surface, not a sitemap dump.
 *
 * IT IS INSIDE THE NIGHT. There is no rule between the closing argument and
 * this, and no change of field: `LandingNight foot` picks the closing
 * region's ramp up at exactly the value it handed over and keeps darkening,
 * so the last thousand pixels of the page are one object and the page ends
 * instead of fading out. That is also why nothing here declares a colour of
 * its own — the night re-points `--publy-foreground`, `--publy-border` and
 * their Tailwind aliases on its own scope, so the identical markup that would
 * render on paper renders in cream on deep warm black here.
 *
 * Three further decisions:
 *
 * 1. TWO-TONE HIERARCHY, inverted (todesktop-34). The links are
 *    full-strength foreground and the group titles are quieter, because in a
 *    footer you are looking for a destination, not a category. The hierarchy
 *    is carried by REGISTER — 13px uppercase for a category, 15px sentence
 *    case for a destination — rather than by luminance alone: "quiet" is
 *    never a licence to be unreadable, so no title drops below the secondary
 *    step. The copyright line moves off `.publy-type-helper` for the same
 *    reason.
 *
 * 2. NO CTA. The closing argument immediately above ends on a primary button;
 *    a second one 100px later is not a second chance, it is a repeat. The
 *    footer's job is destinations, so "Sign up" is a link here like any
 *    other.
 *
 * 3. EVERY DESTINATION IS REAL. Two groups, five links, all of them resolve:
 *    three in-page anchors and two routes. There is no Company column, no
 *    Legal column, no Changelog — inventing plausible footer columns for
 *    routes that do not exist is the same failure as inventing a customer
 *    logo, and the page refuses both.
 *
 * The grid drops to a single stacked column below 768 rather than reflowing
 * two 3-track groups into something narrower than their own labels.
 */
const FOOTER_LINK_CLASS =
	'publy-landing-pressable publy-landing-focus-ring publy-landing-underline publy-type-sky-label -mx-2 inline-flex w-fit rounded-[var(--publy-radius-small-control)] px-2 py-1 text-(--publy-foreground)';

export const LandingFooter = () => {
	const { t } = useTranslation('landing');
	const year = new Date().getFullYear();

	return (
		<footer data-testid="landing-footer" className="mt-auto">
			<LandingNight foot>
				<div className="publy-landing-ruled-column px-4 pt-4 pb-16 sm:px-6 sm:pt-8 sm:pb-24">
					<div className="grid gap-12 md:grid-cols-12 md:gap-8">
						<div className="md:col-span-5">
							<MarketingBrand />
							<p className="publy-type-sky-body mt-4 max-w-[36ch] text-pretty text-(--publy-foreground-secondary)">
								{t('landing-footer-line')}
							</p>
						</div>
						<nav
							aria-label={t('landing-footer-nav-aria-label')}
							className="grid grid-cols-2 gap-8 md:col-span-6 md:col-start-7"
						>
							<div className="flex flex-col gap-3">
								<p className="publy-marketing-eyebrow mb-1 text-(--publy-foreground-secondary)">
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
								<p className="publy-marketing-eyebrow mb-1 text-(--publy-foreground-secondary)">
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
					<p className="publy-type-sky-body mt-12 border-t border-(--publy-border) pt-8 text-(--publy-foreground-secondary)">
						{t('landing-footer-copyright', { year })}
					</p>
				</div>
			</LandingNight>
		</footer>
	);
};
