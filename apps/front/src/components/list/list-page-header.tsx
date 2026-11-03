import {
	IconChevronDown,
	IconChevronUp,
	IconDownload,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { PageHeader } from '~/components/ui/product-page';

/** The unknown-total convention (§4.1 item 11): « — », never a page sum. */
const DASH = '—';

type ListPageHeaderProps = {
	title: string;
	description?: string;
	inset?: { description?: string };
	/** The whole-collection count, or `null` when it is not fully known. */
	count: number | null;
	onExport?: () => void;
	/** The primary action element (a link to the create page, or a button). */
	newAction?: ReactNode;
	cards?: ReactNode;
	statsOpen: boolean;
	onToggleStats: () => void;
};

/** The list page's title row: the page header or, inside a detail tab, the
 * inset heading with its count pill. Split out of `ListPage` so the component
 * stays under the `react-doctor/no-giant-component` size bound. */
export const ListPageHeader = ({
	title,
	description,
	inset,
	count,
	onExport,
	newAction,
	cards,
	statsOpen,
	onToggleStats,
}: ListPageHeaderProps) => {
	const { t } = useTranslation('common');

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
				{newAction}
			</div>
		);
	}

	return (
		<PageHeader
			title={title}
			description={description}
			actions={
				<>
					{onExport ? (
						<Button
							variant="outline"
							aria-label={t('list-export')}
							onClick={onExport}
						>
							<IconDownload data-icon="inline-start" />
							<span className="hidden md:inline">{t('list-export')}</span>
						</Button>
					) : null}
					{newAction}
					{cards ? (
						<Button
							variant="ghost"
							size="icon-sm"
							aria-expanded={statsOpen}
							aria-label={
								statsOpen ? t('list-stats-collapse') : t('list-stats-expand')
							}
							onClick={onToggleStats}
						>
							{statsOpen ? (
								<IconChevronUp aria-hidden="true" />
							) : (
								<IconChevronDown aria-hidden="true" />
							)}
						</Button>
					) : null}
				</>
			}
		/>
	);
};
