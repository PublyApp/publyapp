import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';

/** One labelled figure of a card. */
const Figure = ({
	label,
	strong,
	children,
}: {
	label: string;
	strong?: boolean;
	children: ReactNode;
}) => (
	<div className="min-w-0">
		<dt className="text-xs text-muted-foreground">{label}</dt>
		<dd
			className={cn(
				'flex flex-wrap items-center gap-1 tabular-nums',
				strong && 'font-semibold',
			)}
		>
			{children}
		</dd>
	</div>
);

/** A card's bottom line: what `children` say, then `label` and its `value`. */
export const CardFoot = ({
	children,
	label,
	value,
}: {
	children?: ReactNode;
	label: string;
	value: ReactNode;
}) => (
	<div className="flex flex-wrap items-center gap-2 border-t pt-2 text-xs text-muted-foreground">
		{children}
		<span className="ml-auto">
			{label} <span className="font-medium text-foreground">{value}</span>
		</span>
	</div>
);

/**
 * One row of a list as a card below `md` (Shopkart OS `list-card.tsx`): a
 * header (code, badges, end), then the title, its sub line and the figures.
 * The whole card opens the row.
 */
export const ListCard = ({
	onOpen,
	openLabel,
	code,
	badges,
	end,
	title,
	sub,
	children,
}: {
	onOpen: () => void;
	openLabel: string;
	code: string;
	badges?: ReactNode;
	end?: ReactNode;
	title: ReactNode;
	sub?: ReactNode;
	children?: ReactNode;
}) => (
	<div
		role="link"
		tabIndex={0}
		aria-label={openLabel}
		onClick={onOpen}
		onKeyDown={(event) => {
			if (event.key === 'Enter' && event.target === event.currentTarget) {
				onOpen();
			}
		}}
		className="cursor-pointer rounded-[var(--publy-radius-medium-control)] bg-card p-1 shadow-[var(--publy-shadow-chrome)] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
	>
		<div className="flex items-center gap-2 px-2 py-1.5">
			<span className="text-sm font-medium whitespace-nowrap text-muted-foreground">
				{code}
			</span>
			{badges}
			<span className="ml-auto text-xs whitespace-nowrap text-muted-foreground">
				{end}
			</span>
		</div>
		<div className="flex flex-col gap-3 rounded-[var(--publy-radius-medium-control)] border bg-background p-3">
			<div>
				<p className="text-[15px] font-medium">{title}</p>
				{sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
			</div>
			{children}
		</div>
	</div>
);

/** The table footer as a card (the recap): one figure per total. */
const SummaryCard = ({
	figures,
}: {
	figures: { label: string; value: string }[];
}) => {
	const { t } = useTranslation('common');
	return (
		<div className="rounded-[var(--publy-radius-medium-control)] bg-card p-1 shadow-[var(--publy-shadow-chrome)]">
			<div className="px-3 pt-1 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
				{t('list-summary')}
			</div>
			<dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-[var(--publy-radius-medium-control)] border bg-background p-3 text-sm">
				{figures.map((figure) => (
					<Figure key={figure.label} label={figure.label}>
						{figure.value}
					</Figure>
				))}
			</dl>
		</div>
	);
};

/** Below `md`: `empty` without rows, one card per row, then the recap. */
export const ListCards = ({
	count,
	empty,
	summary,
	children,
}: {
	count: number;
	empty: ReactNode;
	summary?: { label: string; value: string }[];
	children: ReactNode;
}) => (
	<div className="flex flex-col gap-3 md:hidden">
		{count === 0 ? empty : null}
		{children}
		{count > 0 && summary ? <SummaryCard figures={summary} /> : null}
	</div>
);
