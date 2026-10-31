import { cn } from '~/lib/utils';

export type HomeTabDef = {
	key: string;
	label: string;
	/** `null` when the API offers no count source: the pill shows « — ». */
	count: number | null;
};

/**
 * The tabs above a list (Shopkart OS `home-tabs.tsx`): the page's own tab
 * row, sticky under the topbar, each tab carrying its count in the Shopkart
 * pill. The active tab keeps its count.
 */
export const HomeTabs = ({
	tabs,
	current,
	onPick,
	label,
}: {
	tabs: readonly HomeTabDef[];
	current: string;
	onPick: (key: string) => void;
	label: string;
}) => (
	<nav
		aria-label={label}
		className="no-scrollbar sticky top-[calc(var(--page-pad-top)*-1)] z-(--publy-z-raised) flex items-end gap-1 overflow-x-auto border-b bg-background whitespace-nowrap max-md:-mx-4 max-md:px-4"
	>
		{tabs.map((tab) => {
			const active = tab.key === current;
			return (
				<button
					key={tab.key}
					type="button"
					data-active={active || undefined}
					aria-current={active ? 'page' : undefined}
					onClick={() => onPick(tab.key)}
					className={cn(
						'-mb-px flex h-11 items-center gap-2 border-b-2 border-transparent px-3 text-sm text-muted-foreground hover:text-foreground data-active:border-foreground data-active:font-medium data-active:text-foreground md:h-9',
					)}
				>
					{tab.label}
					<span className="flex h-5 items-center rounded-[var(--publy-radius-chip)] bg-secondary px-2 text-xs font-medium text-secondary-foreground tabular-nums">
						{tab.count ?? '—'}
					</span>
				</button>
			);
		})}
	</nav>
);
