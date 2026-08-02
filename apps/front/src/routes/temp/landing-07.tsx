import { createFileRoute } from '@tanstack/react-router';
import { LedgerFooter } from '~/components/marketing/landing-07/ledger-footer';
import { LedgerFrame } from '~/components/marketing/landing-07/ledger-frame';
import { LedgerHeader } from '~/components/marketing/landing-07/ledger-header';
import {
	LEDGER_ROWS,
	LedgerRow,
} from '~/components/marketing/landing-07/ledger-row';

export const Route = createFileRoute('/temp/landing-07')({
	component: LandingExploration07,
	staticData: { i18nNamespaces: ['landing-07'], crumbs: 'shell' },
});

/**
 * Exploration 07 — "THE LEDGER" (see .dump/PROMPT.md). Task 1 of 5 builds the
 * visual language and the page skeleton only: the ledger frame, the header,
 * one empty numbered row per section in the census, and the footer frame.
 * Row content (headings, copy, imagery slots) lands in tasks 2 and 3.
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
					<LedgerRow key={row.slug} row={row} />
				))}
			</LedgerFrame>
			<LedgerFooter />
		</div>
	);
}
