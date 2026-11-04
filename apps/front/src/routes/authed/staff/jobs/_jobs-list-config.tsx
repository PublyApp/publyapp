import {
	IconAlertCircle,
	IconAlertTriangle,
	IconBuilding,
	IconCalendar,
	IconCircleCheck,
	IconCircleDashed,
	IconClock,
	IconHash,
	IconLock,
	IconPlayerPause,
	IconRefresh,
	IconRepeat,
	IconSettingsAutomation,
	IconStack2,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type {
	ListColumn,
	ListFilter,
	ListMobileCard,
} from '~/components/list/list-types';
import { IconTile } from '~/components/ui/icon-tile';
import { StatusPill } from '~/components/ui/product-page';
import { Switch } from '~/components/ui/switch';
import type {
	StaffDeadLetterRow,
	StaffJobQueueRow,
	StaffSystemJobDefinitionRow,
} from '~/lib/query/staff-jobs';
import { cn } from '~/lib/utils';
import { buildCsv } from '~/utils/csv';
import { downloadFile, formatExportDateStamp } from '~/utils/download-file';
import {
	formatNumericDay,
	getRelativeTimeParts,
	type RelativeTimeParts,
} from '~/utils/format-time';

import type {
	DeadLetterListCounts,
	JobQueueListCounts,
	SystemJobListCounts,
} from '@org/client-ts/models/index';

import {
	cronText,
	DEAD_LETTER_STATE_LABEL,
	deadLetterState,
	type DeadLetterState,
	JOB_FAMILY_META,
	JOB_FAMILY_ORDER,
	jobDescription,
	jobLabel,
	jobOf,
} from './_job-catalogue';
import { formatFailureCause } from './_jobs-helpers';
import {
	externalStateStatusLabel,
	externalStateStatusTone,
	queueStatusLabel,
	queueStatusTone,
} from './_jobs-status';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** The job cell: the family's tinted tile with its icon, the label, and the
 * technical key in mono below (Shopkart `job-types.tsx`). Local, not exported:
 * a component file that also exports data would fail React Doctor's
 * `only-export-components` rule. */
const JobCell = ({
	jobKey,
	t,
}: {
	jobKey: string | null | undefined;
	t: Translate;
}) => {
	const job = jobOf(jobKey);
	const Icon = job.icon;
	const label = jobLabel(t, jobKey);
	const description = jobDescription(t, jobKey);

	return (
		<span
			className="flex min-w-0 items-center gap-2"
			title={description || undefined}
		>
			<IconTile icon={Icon} tint={JOB_FAMILY_META[job.family].tint} />
			<span className="flex min-w-0 flex-col leading-tight">
				<span className="truncate font-medium">{label}</span>
				<span className="truncate font-mono text-[11px] text-muted-foreground">
					{job.key}
				</span>
			</span>
		</span>
	);
};

const dash = <span className="text-muted-foreground">—</span>;

const relativeText = (
	t: Translate,
	parts: RelativeTimeParts | null,
): string | null => {
	if (!parts) {
		return null;
	}
	return t(`staff-jobs:jobs-relative-${parts.key.replace('-ago', '')}`, {
		count: parts.count,
	});
};

/** « 24/10/2026 · il y a 3 j » (§4.1 item 11). */
export const jobWhen = (t: Translate, locale: string) => {
	const render = (value: Date | null): ReactNode => {
		if (!value) {
			return dash;
		}
		const relative = relativeText(t, getRelativeTimeParts(value));
		return (
			<span className="tabular-nums">
				{formatNumericDay(value, locale)}{' '}
				{relative ? (
					<span className="text-xs text-muted-foreground">· {relative}</span>
				) : null}
			</span>
		);
	};
	return render;
};

const OrgCell = ({
	tenantId,
	tenantName,
	t,
}: {
	tenantId: string | null;
	tenantName: string | null;
	t: Translate;
}) => {
	if (!tenantId) {
		return (
			<span className="text-muted-foreground">
				{t('staff-jobs:jobs-platform')}
			</span>
		);
	}

	if (tenantName) {
		return (
			<span className="truncate" title={tenantName}>
				{tenantName}
			</span>
		);
	}

	// The API returned no organisation name (deleted organisation): show the
	// technical id, never a made-up name.
	return (
		<span
			className="block truncate font-mono text-xs text-muted-foreground"
			title={tenantId}
		>
			{tenantId}
		</span>
	);
};

const errorCell =
	(t: Translate) => (row: StaffJobQueueRow | StaffDeadLetterRow) => {
		const cause = formatFailureCause(row.lastError, t);
		const absent = cause === t('common:no-cause');
		return (
			<span
				className={cn(
					'block truncate font-mono text-xs',
					absent
						? 'text-muted-foreground'
						: 'text-[var(--publy-chip-suspended-text)]',
				)}
				title={absent ? undefined : cause}
				data-testid={`cell-last-error-${row.id}`}
			>
				{cause}
			</span>
		);
	};

const deadLetterStateIcon = (state: DeadLetterState): ReactNode => {
	if (state === 'open') {
		return (
			<IconAlertTriangle className="size-4 shrink-0 text-[var(--publy-chip-suspended-text)]" />
		);
	}
	if (state === 'requeued') {
		return (
			<IconRefresh className="size-4 shrink-0 text-[var(--publy-chip-invited-text)]" />
		);
	}
	return <IconCircleCheck className="size-4 shrink-0 text-muted-foreground" />;
};

const familyChoices = (t: Translate) =>
	JOB_FAMILY_ORDER.map((family) => {
		const Icon = JOB_FAMILY_META[family].icon;
		return {
			value: family,
			label: t(JOB_FAMILY_META[family].labelKey),
			icon: <Icon className="size-4 shrink-0 text-muted-foreground" />,
		};
	});

const queueStatusChoices = (t: Translate) => [
	{
		value: 'pending',
		label: t('staff-jobs:queue-status-pending'),
		icon: (
			<IconClock className="size-4 shrink-0 text-[var(--publy-chip-pending-text)]" />
		),
	},
	{
		value: 'processing',
		label: t('staff-jobs:queue-status-processing'),
		icon: (
			<IconRefresh className="size-4 shrink-0 text-[var(--publy-chip-invited-text)]" />
		),
	},
];

export const queueFilters = (t: Translate): ListFilter<StaffJobQueueRow>[] => [
	{
		key: 'status',
		label: t('staff-jobs:jobs-filter-statuses'),
		icon: IconCircleDashed,
		choices: queueStatusChoices(t),
		valueOf: (row) => row.status ?? [],
	},
	{
		key: 'family',
		label: t('staff-jobs:jobs-filter-families'),
		icon: IconStack2,
		choices: familyChoices(t),
		valueOf: (row) => jobOf(row.jobType).family,
	},
	{
		key: 'retry',
		label: t('staff-jobs:jobs-filter-retries'),
		icon: IconRepeat,
		panel: false,
		choices: [
			{ value: 'retry', label: t('staff-jobs:jobs-retry-retry') },
			{ value: 'first', label: t('staff-jobs:jobs-retry-first') },
		],
		valueOf: (row) => ((row.attempts ?? 0) > 0 ? 'retry' : 'first'),
	},
];

export const deadLetterFilters = (
	t: Translate,
): ListFilter<StaffDeadLetterRow>[] => [
	{
		key: 'state',
		label: t('staff-jobs:jobs-filter-states'),
		icon: IconCircleDashed,
		choices: (['open', 'requeued', 'triaged'] satisfies DeadLetterState[]).map(
			(state) => ({
				value: state,
				label: t(DEAD_LETTER_STATE_LABEL[state]),
				icon: deadLetterStateIcon(state),
			}),
		),
		valueOf: (row) => deadLetterState(row),
	},
	{
		key: 'family',
		label: t('staff-jobs:jobs-filter-families'),
		icon: IconStack2,
		choices: familyChoices(t),
		valueOf: (row) => jobOf(row.jobType).family,
	},
];

export const systemJobFilters = (
	t: Translate,
): ListFilter<StaffSystemJobDefinitionRow>[] => [
	{
		key: 'state',
		label: t('staff-jobs:jobs-filter-states'),
		icon: IconCircleDashed,
		choices: [
			{
				value: 'true',
				label: t('staff-jobs:jobs-status-enabled'),
				icon: (
					<IconCircleCheck className="size-4 shrink-0 text-[var(--publy-chip-active-text)]" />
				),
			},
			{
				value: 'false',
				label: t('staff-jobs:jobs-status-disabled'),
				icon: (
					<IconPlayerPause className="size-4 shrink-0 text-muted-foreground" />
				),
			},
		],
		valueOf: (row) => (row.isEnabled ? 'true' : 'false'),
	},
	{
		key: 'family',
		label: t('staff-jobs:jobs-filter-families'),
		icon: IconStack2,
		choices: familyChoices(t),
		valueOf: (row) => jobOf(row.jobKey).family,
	},
];

const typeColumn = <T,>(
	t: Translate,
	keyOf: (row: T) => string | null,
): ListColumn<T> => ({
	id: 'type',
	header: t('staff-jobs:jobs-column-task'),
	icon: IconSettingsAutomation,
	width: 360,
	value: (row) => jobLabel(t, keyOf(row)),
	cell: (row) => <JobCell jobKey={keyOf(row)} t={t} />,
});

const whatColumn = <T,>(
	t: Translate,
	keyOf: (row: T) => string | null,
): ListColumn<T> => ({
	id: 'what',
	header: t('staff-jobs:jobs-column-what'),
	icon: IconHash,
	width: 380,
	value: (row) => jobDescription(t, keyOf(row)),
	cell: (row) => (
		<span className="block truncate text-muted-foreground">
			{jobDescription(t, keyOf(row)) || t('common:no-value')}
		</span>
	),
});

const organisationColumn = <T,>(
	t: Translate,
	tenantOf: (row: T) => string | null,
	tenantNameOf: (row: T) => string | null,
): ListColumn<T> => ({
	id: 'org',
	header: t('staff-jobs:jobs-column-organization'),
	icon: IconBuilding,
	width: 190,
	value: (row) => tenantNameOf(row) ?? '',
	cell: (row) => (
		<OrgCell tenantId={tenantOf(row)} tenantName={tenantNameOf(row)} t={t} />
	),
});

const attemptsCell = (attempts: number | null): ReactNode =>
	attempts === null ? (
		dash
	) : (
		<span
			className={cn(
				'tabular-nums',
				attempts > 0 && 'text-[var(--publy-chip-pending-text)]',
			)}
		>
			{attempts}
		</span>
	);

export const queueColumns = (
	t: Translate,
	locale: string,
): ListColumn<StaffJobQueueRow>[] => {
	const when = jobWhen(t, locale);
	return [
		typeColumn(t, (row) => row.jobType),
		whatColumn(t, (row) => row.jobType),
		{
			id: 'status',
			header: t('staff-jobs:jobs-column-status'),
			icon: IconCircleDashed,
			width: 140,
			value: (row) => row.status ?? '',
			cell: (row) => (
				<StatusPill tone={queueStatusTone(row.status)}>
					{queueStatusLabel(t, row.status)}
				</StatusPill>
			),
		},
		organisationColumn(
			t,
			(row) => row.tenantId,
			(row) => row.tenantName ?? null,
		),
		{
			id: 'attempts',
			header: t('staff-jobs:jobs-column-attempts'),
			icon: IconRepeat,
			// The full « Tentatives » label, never an ellipsised header.
			width: 150,
			value: (row) => row.attempts ?? null,
			cell: (row) =>
				row.attempts === null ? (
					dash
				) : (
					<span
						className={cn(
							'tabular-nums',
							row.attempts > 0 && 'text-[var(--publy-chip-pending-text)]',
						)}
					>
						{row.attempts}/{row.maxAttempts ?? dash}
					</span>
				),
		},
		{
			id: 'priority',
			header: t('staff-jobs:jobs-column-priority'),
			icon: IconHash,
			// The full « Priorité » label, never an ellipsised header.
			width: 130,
			value: (row) => row.priority ?? null,
			cell: (row) =>
				row.priority === null ? (
					dash
				) : (
					<span className="tabular-nums">{row.priority}</span>
				),
		},
		{
			id: 'next',
			header: t('staff-jobs:jobs-column-next-attempt'),
			icon: IconClock,
			width: 200,
			value: (row) => row.nextAttemptAt?.toISOString() ?? null,
			cell: (row) => when(row.nextAttemptAt),
		},
		{
			id: 'error',
			header: t('staff-jobs:jobs-column-last-error'),
			icon: IconAlertTriangle,
			width: 380,
			value: (row) => row.lastError ?? '',
			cell: errorCell(t),
		},
		{
			id: 'worker',
			header: t('staff-jobs:jobs-column-worker'),
			icon: IconLock,
			width: 180,
			value: (row) => row.lockedBy ?? '',
			cell: (row) =>
				row.lockedBy ? (
					<span className="block truncate font-mono text-xs text-muted-foreground">
						{row.lockedBy}
					</span>
				) : (
					dash
				),
		},
	];
};

export const deadLetterColumns = (
	t: Translate,
	locale: string,
): ListColumn<StaffDeadLetterRow>[] => {
	const when = jobWhen(t, locale);
	const error = errorCell(t);
	return [
		typeColumn(t, (row) => row.jobType),
		whatColumn(t, (row) => row.jobType),
		{
			id: 'state',
			header: t('staff-jobs:jobs-column-state'),
			icon: IconCircleDashed,
			width: 160,
			value: (row) => deadLetterState(row),
			cell: (row) => {
				const state = deadLetterState(row);
				let tone: 'warning' | 'info' | 'success' = 'warning';
				if (state === 'requeued') {
					tone = 'info';
				} else if (state === 'triaged') {
					tone = 'success';
				}
				return (
					<StatusPill tone={tone}>
						{t(DEAD_LETTER_STATE_LABEL[state])}
					</StatusPill>
				);
			},
		},
		organisationColumn(
			t,
			(row) => row.tenantId,
			(row) => row.tenantName ?? null,
		),
		{
			id: 'attempts',
			header: t('staff-jobs:jobs-column-attempts'),
			icon: IconRepeat,
			width: 120,
			value: (row) => row.attempts ?? null,
			cell: (row) => attemptsCell(row.attempts),
		},
		{
			id: 'error',
			header: t('staff-jobs:jobs-column-last-error'),
			icon: IconAlertTriangle,
			width: 420,
			value: (row) => row.lastError ?? '',
			cell: error,
		},
		{
			id: 'failedAt',
			header: t('staff-jobs:jobs-column-failed-at'),
			icon: IconCalendar,
			width: 180,
			value: (row) => row.failedAt?.toISOString() ?? null,
			cell: (row) => when(row.failedAt),
		},
		{
			id: 'externalState',
			header: t('staff-jobs:jobs-column-external-state'),
			icon: IconAlertCircle,
			width: 180,
			value: (row) => row.externalStateStatus,
			cell: (row) => (
				<StatusPill tone={externalStateStatusTone(row.externalStateStatus)}>
					{externalStateStatusLabel(t, row.externalStateStatus)}
				</StatusPill>
			),
		},
	];
};

export type SystemJobColumnControls = {
	permissionsPending: boolean;
	updateDenied: boolean;
	isTogglePending: boolean;
	explanation?: string;
	onToggleEnabled: (row: StaffSystemJobDefinitionRow, next: boolean) => void;
};

export const systemJobColumns = (
	t: Translate,
	locale: string,
	controls: SystemJobColumnControls,
): ListColumn<StaffSystemJobDefinitionRow>[] => {
	const when = jobWhen(t, locale);
	const updateDisabled = controls.permissionsPending || controls.updateDenied;
	return [
		typeColumn(t, (row) => row.jobKey),
		whatColumn(t, (row) => row.jobKey),
		{
			id: 'state',
			header: t('staff-jobs:jobs-column-state'),
			icon: IconCircleDashed,
			width: 190,
			value: (row) => (row.isEnabled ? 'enabled' : 'disabled'),
			cell: (row) => (
				<span className="flex min-w-0 items-center gap-2">
					<StatusPill tone={row.isEnabled ? 'success' : 'neutral'}>
						{row.isEnabled
							? t('staff-jobs:jobs-status-enabled')
							: t('staff-jobs:jobs-status-disabled')}
					</StatusPill>
					<Switch
						size="sm"
						aria-label={`${t('common:action-toggle-enabled')} ${row.jobKey ?? ''}`}
						data-testid={`system-job-toggle-${row.id}`}
						checked={row.isEnabled === true}
						disabled={updateDisabled || controls.isTogglePending}
						title={updateDisabled ? controls.explanation : undefined}
						onCheckedChange={(checked) =>
							controls.onToggleEnabled(row, checked === true)
						}
					/>
				</span>
			),
		},
		{
			id: 'cron',
			header: t('staff-jobs:jobs-column-plan'),
			icon: IconClock,
			width: 220,
			value: (row) => row.cronExpression ?? '',
			cell: (row) => (
				<span className="flex min-w-0 flex-col leading-tight">
					<span className="truncate">{cronText(t, row.cronExpression)}</span>
					<span className="truncate font-mono text-[11px] text-muted-foreground">
						{row.cronExpression || t('common:no-value')}
					</span>
				</span>
			),
		},
		{
			id: 'last',
			header: t('staff-jobs:jobs-column-last-run'),
			icon: IconRefresh,
			width: 200,
			value: (row) => row.lastEnqueuedAt?.toISOString() ?? null,
			cell: (row) => when(row.lastEnqueuedAt),
		},
		{
			id: 'updatedAt',
			header: t('staff-jobs:jobs-column-updated-at'),
			icon: IconCalendar,
			width: 180,
			value: (row) => row.updatedAt?.toISOString() ?? null,
			cell: (row) => when(row.updatedAt),
		},
	];
};

export const queueTotals =
	(t: Translate, counts: JobQueueListCounts | null | undefined) =>
	(): Map<string, string> => {
		const map = new Map<string, string>();
		map.set(
			'type',
			t('staff-jobs:jobs-total-queue', { count: counts?.total ?? 0 }),
		);
		map.set(
			'status',
			t('staff-jobs:jobs-total-processing', {
				count: counts?.processing ?? 0,
			}),
		);
		map.set(
			'attempts',
			t('staff-jobs:jobs-total-retrying', { count: counts?.retrying ?? 0 }),
		);
		for (const id of ['what', 'org', 'priority', 'next', 'error', 'worker']) {
			map.set(id, '');
		}
		return map;
	};

export const deadLetterTotals =
	(t: Translate, counts: DeadLetterListCounts | null | undefined) =>
	(): Map<string, string> => {
		const map = new Map<string, string>();
		map.set(
			'type',
			t('staff-jobs:jobs-total-dead', { count: counts?.total ?? 0 }),
		);
		map.set(
			'state',
			t('staff-jobs:jobs-total-open', { count: counts?.open ?? 0 }),
		);
		for (const id of [
			'what',
			'org',
			'attempts',
			'error',
			'failedAt',
			'externalState',
		]) {
			map.set(id, '');
		}
		return map;
	};

export const systemJobTotals =
	(t: Translate, counts: SystemJobListCounts | null | undefined) =>
	(): Map<string, string> => {
		const map = new Map<string, string>();
		map.set(
			'type',
			t('staff-jobs:jobs-total-queue', { count: counts?.total ?? 0 }),
		);
		map.set(
			'state',
			t('staff-jobs:jobs-total-enabled', { count: counts?.enabled ?? 0 }),
		);
		for (const id of ['what', 'cron', 'last', 'updatedAt']) {
			map.set(id, '');
		}
		return map;
	};

const mobileRelative = (t: Translate, value: Date | null): ReactNode => {
	if (!value) {
		return t('common:no-value');
	}
	return relativeText(t, getRelativeTimeParts(value)) ?? t('common:no-value');
};

export const queueMobileCard =
	(t: Translate) =>
	(row: StaffJobQueueRow): ListMobileCard => ({
		code: row.jobType ?? '',
		badges: (
			<StatusPill tone={queueStatusTone(row.status)}>
				{queueStatusLabel(t, row.status)}
			</StatusPill>
		),
		end: mobileRelative(t, row.nextAttemptAt),
		title: row.tenantName ?? t('staff-jobs:jobs-platform'),
		sub: row.lastError ? formatFailureCause(row.lastError, t) : '',
		foot: [
			t('staff-jobs:jobs-column-attempts'),
			`${row.attempts ?? t('common:no-value')}/${row.maxAttempts ?? t('common:no-value')}`,
		],
	});

export const deadLetterMobileCard =
	(t: Translate) =>
	(row: StaffDeadLetterRow): ListMobileCard => {
		const state = deadLetterState(row);
		return {
			code: row.jobType ?? '',
			badges: (
				<StatusPill tone={state === 'open' ? 'warning' : 'neutral'}>
					{t(DEAD_LETTER_STATE_LABEL[state])}
				</StatusPill>
			),
			end: mobileRelative(t, row.failedAt),
			title: row.tenantName ?? t('staff-jobs:jobs-platform'),
			sub: row.lastError ? formatFailureCause(row.lastError, t) : '',
			foot: [
				t('staff-jobs:jobs-column-attempts'),
				row.attempts ?? t('common:no-value'),
			],
		};
	};

export const systemJobMobileCard =
	(t: Translate) =>
	(row: StaffSystemJobDefinitionRow): ListMobileCard => ({
		code: row.cronExpression ?? '',
		badges: (
			<StatusPill tone={row.isEnabled ? 'success' : 'neutral'}>
				{row.isEnabled
					? t('staff-jobs:jobs-status-enabled')
					: t('staff-jobs:jobs-status-disabled')}
			</StatusPill>
		),
		end: mobileRelative(t, row.lastEnqueuedAt),
		title: jobLabel(t, row.jobKey),
		sub: jobDescription(t, row.jobKey),
		foot: [
			t('staff-jobs:jobs-column-plan'),
			row.cronExpression ?? t('common:no-value'),
		],
	});

export const exportJobRows = <T,>(
	rows: T[],
	columns: ListColumn<T>[],
	t: Translate,
	fileNameKey: string,
): void => {
	const csv = buildCsv([
		columns.map((column) => column.header),
		...rows.map((row) =>
			columns.map((column) => {
				const value = column.value?.(row) ?? '';
				return value === null ? '' : String(value);
			}),
		),
	]);
	downloadFile({
		data: csv,
		fileName: `${t(fileNameKey)}-${formatExportDateStamp(new Date())}.csv`,
		mimeType: 'text/csv;charset=utf-8',
	});
};
