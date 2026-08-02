import {
	IconBuilding,
	IconShieldCheck,
	IconStack2,
	IconUsers,
	IconUsersGroup,
} from '@tabler/icons-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';

import { LedgerRowHeader } from './ledger-row-header';

type WhoForCell = {
	id: string;
	titleI18nKey: string;
	bodyI18nKey: string;
	icon: ReactElement;
	/** 2-over-3 bento arrangement inside the 6-track grid at `lg` (§4 Row 06). */
	lgSpan: 'lg:col-span-3' | 'lg:col-span-2';
};

// The three named segments from _context.md §1 (teams and agencies, in-house
// operations, small studios) plus the two capability cells the retired page
// already shipped under landing-bento-* — same five, same order, ported into
// this namespace and paired with one inline Tabler icon instead of a 96px
// watermark glyph.
const WHO_FOR_CELLS: readonly WhoForCell[] = [
	{
		id: 'teams-agencies',
		titleI18nKey: 'who-for-teams-agencies-title',
		bodyI18nKey: 'who-for-teams-agencies-body',
		icon: <IconUsers className="size-4" />,
		lgSpan: 'lg:col-span-3',
	},
	{
		id: 'inhouse-operations',
		titleI18nKey: 'who-for-inhouse-operations-title',
		bodyI18nKey: 'who-for-inhouse-operations-body',
		icon: <IconBuilding className="size-4" />,
		lgSpan: 'lg:col-span-3',
	},
	{
		id: 'small-studios',
		titleI18nKey: 'who-for-small-studios-title',
		bodyI18nKey: 'who-for-small-studios-body',
		icon: <IconStack2 className="size-4" />,
		lgSpan: 'lg:col-span-2',
	},
	{
		id: 'role-access',
		titleI18nKey: 'who-for-role-access-title',
		bodyI18nKey: 'who-for-role-access-body',
		icon: <IconShieldCheck className="size-4" />,
		lgSpan: 'lg:col-span-2',
	},
	{
		id: 'shared-queue',
		titleI18nKey: 'who-for-shared-queue-title',
		bodyI18nKey: 'who-for-shared-queue-body',
		icon: <IconUsersGroup className="size-4" />,
		lgSpan: 'lg:col-span-2',
	},
];

/**
 * Row 06 — Who it is for (PROMPT.md §4 Row 06). Five cells in a `gap-px`
 * grid, 2-over-3 at `lg` (the "bento" idea drawn as a table rather than
 * floating cards). Watermark icons are dropped — a 96px ghosted glyph behind
 * text is decoration standing in for imagery, the exact compensation reflex
 * the override exists to stop — in favour of one 16px Tabler icon inline
 * with each heading. Hover: the growing left rule (`attio-26`), same
 * construction as Row 02.
 *
 * Empty-slot reading: no slot.
 */
export const LedgerWhoFor = ({ rowNumber }: { rowNumber: string }) => {
	const { t } = useTranslation('landing-07');

	return (
		<div>
			<LedgerRowHeader
				number={rowNumber}
				eyebrow={t('who-for-eyebrow')}
				title={t('who-for-title')}
			/>
			<div className="grid grid-cols-1 gap-px bg-(--publy-rule) md:grid-cols-2 lg:grid-cols-6">
				{WHO_FOR_CELLS.map((cell) => (
					<div
						key={cell.id}
						className={cn(
							"group relative flex min-h-[196px] flex-col gap-2 overflow-hidden bg-(--publy-background) p-6 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:origin-top before:scale-y-0 before:bg-(--publy-primary) before:transition-transform before:duration-300 before:ease-[cubic-bezier(0.22,1,0.36,1)] before:content-[''] hover:before:scale-y-100 hover:before:duration-50 md:p-7",
							cell.lgSpan,
						)}
					>
						<h3 className="ld07-display-3 flex max-w-[22ch] items-center gap-2 text-balance">
							<span
								aria-hidden="true"
								className="text-(--publy-foreground-subtle)"
							>
								{cell.icon}
							</span>
							{t(cell.titleI18nKey)}
						</h3>
						<p className="ld07-body max-w-[44ch] text-(--publy-foreground-secondary)">
							{t(cell.bodyI18nKey)}
						</p>
					</div>
				))}
			</div>
		</div>
	);
};
