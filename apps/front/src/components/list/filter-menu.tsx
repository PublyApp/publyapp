import { IconFilter, IconX } from '@tabler/icons-react';
import { useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '~/components/ui/bottom-sheet';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '~/components/ui/popover';
import { useMediaQuery } from '~/lib/hooks/use-media-query';

import type { ListFilter, ListFiltersValue } from './list-types';
import { labelOfFilterValue } from './list-types';

export type FilterCounts = Record<string, Record<string, number>>;

const FilterButton = ({
	activeCount,
	...props
}: ComponentProps<typeof Button> & { activeCount: number }) => {
	const { t } = useTranslation('common');
	return (
		<Button
			{...props}
			type="button"
			variant="outline"
			aria-label={`${t('list-filters')} · ${t('list-filter-active', { count: activeCount })}`}
		>
			<IconFilter data-icon="inline-start" />
			{t('list-filters')}
			{activeCount > 0 ? (
				<span className="flex h-5 min-w-5 items-center justify-center rounded-[var(--publy-radius-chip)] bg-primary px-1.5 text-xs font-medium text-primary-foreground tabular-nums">
					{activeCount}
				</span>
			) : null}
		</Button>
	);
};

const FilterOptions = <T,>({
	filters,
	active,
	counts,
	onToggle,
	onClear,
}: {
	filters: readonly ListFilter<T>[];
	active: ListFiltersValue;
	counts: FilterCounts;
	onToggle: (key: string, value: string) => void;
	onClear: (key: string) => void;
}) => {
	const { t } = useTranslation('common');
	return (
		<div className="flex flex-col divide-y">
			{filters.map((filter) => {
				const selected = active[filter.key] ?? [];
				const Icon = filter.icon;
				return (
					<section key={filter.key} className="flex flex-col gap-1 p-2">
						<div className="flex items-center justify-between gap-2 px-1 py-1">
							<span className="flex min-w-0 items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
								<Icon aria-hidden="true" className="size-3.5 shrink-0" />
								<span className="truncate">{filter.label}</span>
							</span>
							{selected.length > 0 ? (
								<button
									type="button"
									onClick={() => onClear(filter.key)}
									className="shrink-0 rounded-[var(--publy-radius-sm)] px-1 text-xs text-muted-foreground hover:text-foreground"
								>
									{t('list-clear-all')}
								</button>
							) : null}
						</div>
						{filter.choices.map((choice) => {
							const checked = selected.includes(choice.value);
							return (
								<label
									key={choice.value}
									className="flex h-8 cursor-pointer items-center gap-2 rounded-[var(--publy-radius-menu-item)] px-2 text-sm hover:bg-secondary"
								>
									<Checkbox
										checked={checked}
										onCheckedChange={() => onToggle(filter.key, choice.value)}
										aria-label={choice.label}
									/>
									{choice.icon ?? (
										<Icon
											aria-hidden="true"
											className="size-4 shrink-0 text-muted-foreground"
										/>
									)}
									<span className="min-w-0 flex-1 truncate">
										{choice.label}
									</span>
									<span className="text-xs text-muted-foreground tabular-nums">
										{counts[filter.key]?.[choice.value] ?? 0}
									</span>
								</label>
							);
						})}
					</section>
				);
			})}
		</div>
	);
};

/**
 * A list page's one filter button (Shopkart OS `filter-menu.tsx`): from `md`
 * a popover with every category and its options; below `md` the same content
 * in a bottom sheet. The trigger shows how many values are active.
 */
export const FilterMenu = <T,>({
	filters,
	active,
	counts,
	onToggle,
	onClear,
}: {
	filters: readonly ListFilter<T>[];
	active: ListFiltersValue;
	counts: FilterCounts;
	onToggle: (key: string, value: string) => void;
	onClear: (key: string) => void;
}) => {
	const wide = useMediaQuery('(min-width: 768px)');
	const [sheetOpen, setSheetOpen] = useState(false);
	let activeCount = 0;
	for (const filter of filters) {
		activeCount += active[filter.key]?.length ?? 0;
	}
	const content = (
		<FilterOptions
			filters={filters}
			active={active}
			counts={counts}
			onToggle={onToggle}
			onClear={onClear}
		/>
	);

	if (!wide) {
		return (
			<>
				<FilterButton
					activeCount={activeCount}
					className="h-11"
					onClick={() => setSheetOpen(true)}
				/>
				<BottomSheet
					open={sheetOpen}
					onOpenChange={setSheetOpen}
					title={filters.length > 0 ? filters[0].label : ''}
				>
					{content}
				</BottomSheet>
			</>
		);
	}

	return (
		<Popover>
			<PopoverTrigger
				render={<FilterButton activeCount={activeCount} className="h-9" />}
			/>
			<PopoverContent
				align="end"
				className="w-[min(560px,calc(100vw-32px))] p-0"
			>
				<div className="max-h-80 overflow-y-auto">{content}</div>
			</PopoverContent>
		</Popover>
	);
};

/**
 * One removable chip per active filter value under the toolbar, then « Tout
 * effacer » from two values (Shopkart OS `filter-menu.tsx`). The chip's ×
 * removes that one value.
 */
export const FilterChips = <T,>({
	filters,
	active,
	onToggle,
	onClearAll,
}: {
	filters: readonly ListFilter<T>[];
	active: ListFiltersValue;
	onToggle: (key: string, value: string) => void;
	onClearAll: () => void;
}) => {
	const { t } = useTranslation('common');
	const chips = filters.flatMap((filter) =>
		(active[filter.key] ?? []).flatMap((value) => {
			const text = t('list-filter-chip', {
				category: filter.label,
				value: labelOfFilterValue(filter, value),
			});
			const Icon = filter.icon;
			return [
				{
					key: `${filter.key}:${value}`,
					text,
					icon: (
						<Icon
							aria-hidden="true"
							className="size-3.5 shrink-0 text-muted-foreground"
						/>
					),
					onRemove: () => onToggle(filter.key, value),
				},
			];
		}),
	);

	if (chips.length === 0) {
		return null;
	}

	return (
		<div className="no-scrollbar flex items-center gap-2 max-md:-mx-4 max-md:overflow-x-auto max-md:px-4 max-md:whitespace-nowrap md:flex-wrap">
			{chips.map((chip) => (
				<button
					key={chip.key}
					type="button"
					onClick={chip.onRemove}
					aria-label={t('list-filter-remove', { filter: chip.text })}
					className="flex h-11 shrink-0 items-center gap-1.5 rounded-[var(--publy-radius-chip)] bg-secondary pr-2.5 pl-3 text-sm text-secondary-foreground hover:bg-secondary/70 md:h-7"
				>
					{chip.icon}
					{chip.text}
					<IconX
						aria-hidden="true"
						className="size-3.5 text-muted-foreground"
					/>
				</button>
			))}
			{chips.length >= 2 ? (
				<button
					type="button"
					onClick={onClearAll}
					className="flex h-11 shrink-0 items-center px-2 text-sm font-medium text-muted-foreground hover:text-foreground md:h-7"
				>
					{t('list-clear-all')}
				</button>
			) : null}
		</div>
	);
};
