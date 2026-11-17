import { type ReactNode, useState } from 'react';

import { AnnouncementBar } from './announcement-bar';
import { CookieConsentBand } from './cookie-consent-band';
import { CookiePrefsDrawer } from './cookie-prefs-drawer';
import { MarketingContainer } from './marketing-container';
import { MarketingFooter } from './marketing-footer';
import { MarketingHeader } from './marketing-header';
import { MarketingMobileNav } from './marketing-mobile-nav';

/**
 * The marketing shell (#1038): the chrome every marketing page sits in.
 *
 * Header at CHROME width; the page body, any `bands` the caller composes
 * (social proof, CTA band) and the footer at READING width. The mobile drawer and the cookie surfaces are owned here
 * rather than by any page, so their open state survives navigation between
 * marketing pages and there is exactly one of each in the tree.
 */
export const MarketingShell = ({
	children,
	pathname,
	bands,
}: {
	children: ReactNode;
	pathname: string;
	/** Reading-width bands between the page body and the footer (social proof,
	 * CTA): composed by the caller, none by default. */
	bands?: ReactNode;
}) => {
	const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
	const [isCookiePrefsOpen, setIsCookiePrefsOpen] = useState(false);

	return (
		<div
			className="flex min-h-dvh flex-col bg-(--publy-background)"
			data-testid="marketing-shell"
			data-mode="marketing"
		>
			<AnnouncementBar />
			<MarketingHeader
				pathname={pathname}
				onOpenMobileNav={() => setIsMobileNavOpen(true)}
				isMobileNavOpen={isMobileNavOpen}
			/>
			<MarketingMobileNav
				open={isMobileNavOpen}
				onOpenChange={setIsMobileNavOpen}
			/>
			<main id="marketing-main" className="flex-1">
				<MarketingContainer width="reading" className="py-10">
					{children}
				</MarketingContainer>
			</main>
			{bands}
			<MarketingFooter
				onManageCookiePreferences={() => setIsCookiePrefsOpen(true)}
			/>
			<CookieConsentBand onCustomize={() => setIsCookiePrefsOpen(true)} />
			<CookiePrefsDrawer
				open={isCookiePrefsOpen}
				onOpenChange={setIsCookiePrefsOpen}
			/>
		</div>
	);
};
