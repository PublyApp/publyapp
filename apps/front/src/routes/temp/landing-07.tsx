import { createFileRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { LedgerFooter } from '~/components/marketing/landing-07/ledger-footer';
import { LedgerFrame } from '~/components/marketing/landing-07/ledger-frame';
import { LedgerHeader } from '~/components/marketing/landing-07/ledger-header';
import { LedgerHero } from '~/components/marketing/landing-07/ledger-hero';
import { LedgerIndex } from '~/components/marketing/landing-07/ledger-index';
import {
	LEDGER_ROWS,
	LedgerRow,
	type LedgerRowCensusEntry,
} from '~/components/marketing/landing-07/ledger-row';
import { LedgerStatement } from '~/components/marketing/landing-07/ledger-statement';
import { LedgerTour } from '~/components/marketing/landing-07/ledger-tour';

export const Route = createFileRoute('/temp/landing-07')({
	component: LandingExploration07,
	staticData: { i18nNamespaces: ['landing-07'], crumbs: 'shell' },
});

/**
 * Row content for the upper half of the census (task 2 of 5): hero through
 * the product tour. Rows 05–12 (facts through closing) stay empty here —
 * they land in task 3. A row with no entry renders as an empty numbered row,
 * exactly as task 1 left it.
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
		default:
			return null;
	}
}

/**
 * Exploration 07 — "THE LEDGER" (see .dump/PROMPT.md). Task 1 built the
 * visual language and the page skeleton: the ledger frame, the header, one
 * empty numbered row per section in the census, and the footer frame. This
 * task fills rows 01–04 (hero, index, statement, product tour); task 3 fills
 * the remainder.
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
