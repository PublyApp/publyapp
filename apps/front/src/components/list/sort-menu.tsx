import { IconArrowsSort, IconCheck } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '~/components/ui/bottom-sheet';
import { Button } from '~/components/ui/button';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '~/components/ui/popover';
import { useMediaQuery } from '~/lib/hooks/use-media-query';
import { cn } from '~/lib/utils';

import type { ColumnSpecs } from './list-types';

export type ListSort = { id: string; desc: boolean };

const ROW =
	'flex w-full shrink-0 items-center gap-2 rounded-[var(--publy-radius-menu-item)] text-left text-sm hover:bg-secondary';
const ICON = 'size-4 shrink-0 text-muted-foreground';
const DIRECTIONS = [false, true] as const;

const SortRow = ({
	active,
	onClick,
	ariaLabel,
	children,
}: {
	active: boolean;
	onClick: () => void;
	ariaLabel?: string;
	children: ReactNode;
}) => (
	<button
		type="button"
		aria-pressed={active}
		aria-label={ariaLabel}
		onClick={onClick}
		className={cn(ROW, 'h-8 px-2', active && 'bg-secondary font-medium')}
	>
		{children}
		{/* The tick's room is always reserved, so labels do not move. */}
		<IconCheck
			aria-hidden="true"
			className={cn(ICON, 'ml-auto text-primary', !active && 'invisible')}
		/>
	</button>
);

/**
 * The Sort button of a list page (Shopkart OS `sort-sheet.tsx`): the default
 * order first, then each sortable criterion ascending and descending. From
 * `md` a popover; below `md` a bottom sheet. A pick sets the sort and closes.
 */
export const SortMenu = ({
	sort,
	onSort,
	columns,
	ids,
	defaultLabel,
	triggerClassName,
}: {
	sort: ListSort | undefined;
	onSort: (next: ListSort[]) => void;
	columns: ColumnSpecs;
	ids: readonly string[];
	defaultLabel: string;
	triggerClassName?: string;
}) => {
	const { t } = useTranslation('common');
	const wide = useMediaQuery('(min-width: 768px)');
	const [open, setOpen] = useState(false);

	const choose = (next: ListSort[]) => {
		onSort(next);
		setOpen(false);
	};

	const label = sort
		? t('list-sorted-by', {
				column: columns.get(sort.id)?.label ?? sort.id,
				direction: sort.desc ? '↓' : '↑',
			})
		: t('list-sort');

	const trigger = (
		<Button
			variant="outline"
			className={cn('h-9', triggerClassName)}
			aria-label={label}
		>
			<IconArrowsSort data-icon="inline-start" />
			{label}
		</Button>
	);

	const list = (
		<>
			<SortRow active={!sort} onClick={() => choose([])}>
				<IconArrowsSort aria-hidden="true" className={ICON} />
				<span className="min-w-0 flex-1 truncate">{defaultLabel}</span>
			</SortRow>
			<div className="mx-2 my-1 h-px shrink-0 bg-border" />
			<div className="max-h-80 overflow-y-auto">
				{ids.map((id) => {
					const column = columns.get(id);
					if (!column) {
						return null;
					}

					const Icon = column.icon;
					return DIRECTIONS.map((desc) => (
						<SortRow
							key={`${id}-${desc}`}
							active={sort?.id === id && sort.desc === desc}
							ariaLabel={`${column.label} · ${desc ? t('list-sort-desc') : t('list-sort-asc')}`}
							onClick={() => choose([{ id, desc }])}
						>
							<Icon aria-hidden="true" className={ICON} />
							<span className="min-w-0 flex-1 truncate">{column.label}</span>
							<span aria-hidden="true" className="text-muted-foreground">
								{desc ? '↓' : '↑'}
							</span>
						</SortRow>
					));
				})}
			</div>
		</>
	);

	if (!wide) {
		return (
			<>
				<Button
					variant="outline"
					className={cn('h-11', triggerClassName)}
					aria-label={label}
					onClick={() => setOpen(true)}
				>
					<IconArrowsSort data-icon="inline-start" />
					{label}
				</Button>
				<BottomSheet open={open} onOpenChange={setOpen} title={t('list-sort')}>
					<div className="flex flex-col p-1">{list}</div>
				</BottomSheet>
			</>
		);
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger render={trigger} />
			<PopoverContent align="start" className="w-80">
				<div className="flex flex-col">{list}</div>
			</PopoverContent>
		</Popover>
	);
};
