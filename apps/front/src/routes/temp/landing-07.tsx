import { createFileRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { LedgerApprovals } from '~/components/marketing/landing-07/ledger-approvals';
import { LedgerChain } from '~/components/marketing/landing-07/ledger-chain';
import { LedgerClosing } from '~/components/marketing/landing-07/ledger-closing';
import { LedgerFacts } from '~/components/marketing/landing-07/ledger-facts';
import { LedgerFaq } from '~/components/marketing/landing-07/ledger-faq';
import { LedgerFooter } from '~/components/marketing/landing-07/ledger-footer';
import { LedgerFrame } from '~/components/marketing/landing-07/ledger-frame';
import { LedgerHeader } from '~/components/marketing/landing-07/ledger-header';
import { LedgerHero } from '~/components/marketing/landing-07/ledger-hero';
import { LedgerIndex } from '~/components/marketing/landing-07/ledger-index';
import { LedgerPricing } from '~/components/marketing/landing-07/ledger-pricing';
import {
	LEDGER_ROWS,
	LedgerRow,
	type LedgerRowCensusEntry,
} from '~/components/marketing/landing-07/ledger-row';
import { LedgerStatement } from '~/components/marketing/landing-07/ledger-statement';
import { LedgerTour } from '~/components/marketing/landing-07/ledger-tour';
import { LedgerTrial } from '~/components/marketing/landing-07/ledger-trial';
import { LedgerWhoFor } from '~/components/marketing/landing-07/ledger-who-for';

export const Route = createFileRoute('/temp/landing-07')({
	component: LandingExploration07,
	staticData: { i18nNamespaces: ['landing-07'], crumbs: 'shell' },
});

/**
 * Row content for the full census (task 3 of 5 completes it): hero through
 * the closing panel. Task 2 filled rows 01–04 (hero, index, statement,
 * product tour); this task fills rows 05–12 (facts through closing).
 */
function renderRowContent(row: LedgerRowCensusEntry): ReactNode {
	switch (row.slug) {
		case 'hero':
			return <LedgerHero />;
		case 'index':
			return <LedgerIndex />;
		case 'statement':
			return <LedgerStatement />;
		case 'tour':
			return <LedgerTour rowNumber={row.number} />;
		case 'facts':
			return <LedgerFacts rowNumber={row.number} />;
		case 'who-for':
			return <LedgerWhoFor rowNumber={row.number} />;
		case 'approvals':
			return <LedgerApprovals rowNumber={row.number} />;
		case 'chain':
			return <LedgerChain rowNumber={row.number} />;
		case 'trial':
			return <LedgerTrial rowNumber={row.number} />;
		case 'pricing':
			return <LedgerPricing rowNumber={row.number} />;
		case 'faq':
			return <LedgerFaq rowNumber={row.number} />;
		case 'closing':
			return <LedgerClosing />;
		default:
			return null;
	}
}

/**
 * Exploration 07 — "THE LEDGER" (see .dump/PROMPT.md). Task 1 built the
 * visual language and the page skeleton: the ledger frame, the header, one
 * empty numbered row per section in the census, and the footer frame. Task 2
 * filled rows 01–04 (hero through the product tour); this task fills the
 * remainder, rows 05–12 (differentiators through the closing panel).
 *
 * No <main> here: the shared MarketingShell (marketing-shell.tsx, off-limits
 * to this exploration) already renders one around every /temp/* route.
 */
function LandingExploration07() {
	return (
		<div className="publy-landing-07">
			<LedgerHeader />
			<LedgerFrame>
				{LEDGER_ROWS.map((row) => (
					<LedgerRow key={row.slug} row={row}>
						{renderRowContent(row)}
					</LedgerRow>
				))}
			</LedgerFrame>
			<LedgerFooter />
		</div>
	);
}
