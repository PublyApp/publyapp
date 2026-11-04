import {
	IconChevronDown,
	IconChevronUp,
	IconDownload,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import {
	PageActions,
	PageHeader,
	type PageAction,
} from '~/components/ui/product-page';

/** The unknown-total convention (§4.1 item 11): « — », never a page sum. */
const DASH = '—';

type ListPageHeaderProps = {
	title: string;
	inset?: { description?: string };
	/** The whole-collection count, or `null` when it is not fully known. */
	count: number | null;
	onExport?: () => void;
	/** The established test id of the page's export control (the audit log's
	 * export drawer spec opens it by id). */
	exportTestId?: string;
	/** The primary action as data: rendered as the desktop button and as a
	 * mobile speed-dial action. */
	newAction?: PageAction;
	cards?: ReactNode;
	statsOpen: boolean;
	onToggleStats: () => void;
};

/** The list page's title row: the page header or, inside a detail tab, the
 * inset heading with its count pill. Split out of `ListPage` so the component
 * stays under the `react-doctor/no-giant-component` size bound. */
export const ListPageHeader = ({
	title,
	inset,
	count,
	onExport,
	exportTestId,
	newAction,
	cards,
	statsOpen,
	onToggleStats,
}: ListPageHeaderProps) => {
	const { t } = useTranslation('common');
	const statsToggle = cards ? (
		<Button
			variant="ghost"
			size="icon"
			aria-expanded={statsOpen}
			aria-label={statsOpen ? t('list-stats-collapse') : t('list-stats-expand')}
			onClick={onToggleStats}
		>
			{statsOpen ? (
				<IconChevronUp aria-hidden="true" />
			) : (
				<IconChevronDown aria-hidden="true" />
			)}
		</Button>
	) : undefined;

	if (inset) {
		return (
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="flex min-w-0 flex-col gap-1">
					<h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
						{title}
						<span className="flex h-5 items-center rounded-[var(--publy-radius-chip)] bg-secondary px-2 text-xs font-medium text-secondary-foreground tabular-nums">
							{count ?? DASH}
						</span>
					</h2>
					{inset.description ? (
						<p className="text-sm text-muted-foreground">{inset.description}</p>
					) : null}
				</div>
				{newAction ? (
					<PageActions action={newAction} speedDialLabel={t('actions')} />
				) : null}
			</div>
		);
	}

	return (
		<PageHeader
			title={title}
			actions={
				onExport ? (
					<Button
						variant="outline"
						aria-label={t('list-export')}
						onClick={onExport}
						data-testid={exportTestId}
						className="max-md:hidden"
					>
						<IconDownload data-icon="inline-start" />
						{t('list-export')}
					</Button>
				) : null
			}
			action={newAction}
			trailingActions={statsToggle}
			speedDialActions={
				onExport
					? [
							{
								id: 'export',
								label: t('list-export'),
								icon: IconDownload,
								onSelect: onExport,
							},
						]
					: undefined
			}
			speedDialLabel={t('actions')}
		/>
	);
};
