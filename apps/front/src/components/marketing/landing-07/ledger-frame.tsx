import type { ReactNode } from 'react';

/**
 * The ledger frame (PROMPT.md §3.1–3.2): a 1280px column, ruled on both
 * edges at `lg` and above, that vanishes below `lg` (`max-lg:contents`)
 * rather than shrinking — a 1px rule 16px from a phone's edge reads as a
 * rendering artefact, so the wrapper and its borders simply stop existing
 * there. The horizontal row seams (owned by each row itself) persist at
 * every width; only these vertical rules are gated.
 */
export const LedgerFrame = ({ children }: { children: ReactNode }) => (
	<div className="mx-auto w-full max-w-(--publy-container-chrome) max-lg:contents lg:border-x lg:border-(--publy-rule)">
		{children}
	</div>
);
