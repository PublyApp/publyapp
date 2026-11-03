import {
	IconBrandBluesky,
	IconCalendarDue,
	IconClockCog,
	IconKey,
	IconMail,
	IconMailCheck,
	IconMailForward,
	IconPhotoX,
	IconSend,
	IconTool,
	IconTrash,
	IconUserPlus,
	IconUserX,
	type TablerIcon,
} from '@tabler/icons-react';

/** The four job families of §4.8: their label key and Shopkart thumb tint. */
export type JobFamily = 'publishing' | 'email' | 'accounts' | 'maintenance';

export const JOB_FAMILY_ORDER = [
	'publishing',
	'email',
	'accounts',
	'maintenance',
] as const satisfies readonly JobFamily[];

export const JOB_FAMILY_META = {
	publishing: {
		labelKey: 'staff-jobs:jobs-family-publishing',
		tint: 'var(--publy-profile-tone-4-bg)',
		icon: IconSend,
	},
	email: {
		labelKey: 'staff-jobs:jobs-family-email',
		tint: 'var(--publy-profile-tone-5-bg)',
		icon: IconMail,
	},
	accounts: {
		labelKey: 'staff-jobs:jobs-family-accounts',
		tint: 'var(--publy-profile-tone-1-bg)',
		icon: IconBrandBluesky,
	},
	maintenance: {
		labelKey: 'staff-jobs:jobs-family-maintenance',
		tint: 'var(--publy-profile-tone-0-bg)',
		icon: IconTool,
	},
} satisfies Record<
	JobFamily,
	{ labelKey: string; tint: string; icon: TablerIcon }
>;

type JobDefinition = {
	/** Absent for an unknown technical key: the key itself is the label. */
	labelKey?: string;
	descriptionKey?: string;
	icon: TablerIcon;
	family: JobFamily;
	key: string;
};

const JOBS = {
	'publishing.publish-publication.v1': {
		labelKey: 'staff-jobs:jobs-job-publish-publication-label',
		descriptionKey: 'staff-jobs:jobs-job-publish-publication-description',
		icon: IconSend,
		family: 'publishing',
	},
	'publishing.dispatch-due-posts.v1': {
		labelKey: 'staff-jobs:jobs-job-dispatch-due-posts-label',
		descriptionKey: 'staff-jobs:jobs-job-dispatch-due-posts-description',
		icon: IconCalendarDue,
		family: 'publishing',
	},
	'email.tenant-invitation.v1': {
		labelKey: 'staff-jobs:jobs-job-tenant-invitation-label',
		descriptionKey: 'staff-jobs:jobs-job-tenant-invitation-description',
		icon: IconUserPlus,
		family: 'email',
	},
	'email.verify.v1': {
		labelKey: 'staff-jobs:jobs-job-verify-email-label',
		descriptionKey: 'staff-jobs:jobs-job-verify-email-description',
		icon: IconMailCheck,
		family: 'email',
	},
	'email.password-reset.v1': {
		labelKey: 'staff-jobs:jobs-job-password-reset-label',
		descriptionKey: 'staff-jobs:jobs-job-password-reset-description',
		icon: IconKey,
		family: 'email',
	},
	'email.staff-joined-notification.v1': {
		labelKey: 'staff-jobs:jobs-job-staff-joined-notification-label',
		descriptionKey: 'staff-jobs:jobs-job-staff-joined-notification-description',
		icon: IconMailForward,
		family: 'email',
	},
	'jobs.missing.social-account-token-refresh.v1': {
		labelKey: 'staff-jobs:jobs-job-social-account-token-refresh-label',
		descriptionKey:
			'staff-jobs:jobs-job-social-account-token-refresh-description',
		icon: IconBrandBluesky,
		family: 'accounts',
	},
	'upload-orphan-reclaim': {
		labelKey: 'staff-jobs:jobs-job-upload-orphan-reclaim-label',
		descriptionKey: 'staff-jobs:jobs-job-upload-orphan-reclaim-description',
		icon: IconPhotoX,
		family: 'maintenance',
	},
	'session-cleanup': {
		labelKey: 'staff-jobs:jobs-job-session-cleanup-label',
		descriptionKey: 'staff-jobs:jobs-job-session-cleanup-description',
		icon: IconUserX,
		family: 'maintenance',
	},
	'email-log-retention': {
		labelKey: 'staff-jobs:jobs-job-email-log-retention-label',
		descriptionKey: 'staff-jobs:jobs-job-email-log-retention-description',
		icon: IconMail,
		family: 'maintenance',
	},
	'email-prepared-sends-retention': {
		labelKey: 'staff-jobs:jobs-job-email-prepared-sends-retention-label',
		descriptionKey:
			'staff-jobs:jobs-job-email-prepared-sends-retention-description',
		icon: IconTrash,
		family: 'maintenance',
	},
	'job-dead-letter-retention': {
		labelKey: 'staff-jobs:jobs-job-dead-letter-retention-label',
		descriptionKey: 'staff-jobs:jobs-job-dead-letter-retention-description',
		icon: IconTrash,
		family: 'maintenance',
	},
	'system-job-occurrence-retention': {
		labelKey: 'staff-jobs:jobs-job-system-job-occurrence-retention-label',
		descriptionKey:
			'staff-jobs:jobs-job-system-job-occurrence-retention-description',
		icon: IconClockCog,
		family: 'maintenance',
	},
} satisfies Record<string, Omit<JobDefinition, 'key'>>;

export const jobOf = (key: string | null | undefined): JobDefinition => {
	const technicalKey = key?.trim() ?? '';
	const known: Omit<JobDefinition, 'key'> | undefined =
		Object.prototype.hasOwnProperty.call(JOBS, technicalKey)
			? JOBS[technicalKey as keyof typeof JOBS]
			: undefined;
	if (known) {
		return { ...known, key: technicalKey };
	}

	return {
		key: technicalKey,
		icon: IconClockCog,
		family: 'maintenance',
	};
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

export const jobLabel = (
	t: Translate,
	key: string | null | undefined,
): string => {
	const job = jobOf(key);
	return job.labelKey ? t(job.labelKey) : job.key;
};

export const jobDescription = (
	t: Translate,
	key: string | null | undefined,
): string => {
	const job = jobOf(key);
	return job.descriptionKey ? t(job.descriptionKey) : '';
};

export const familyLabel = (t: Translate, family: JobFamily): string =>
	t(JOB_FAMILY_META[family].labelKey);

/** Free-text haystack for the client-side search (the list endpoints have no
 * `q` parameter — see `.report-4b.md`). */
export const jobSearchText = (
	t: Translate,
	key: string | null | undefined,
): string => `${key ?? ''} ${jobLabel(t, key)} ${jobDescription(t, key)}`;

/** The job cell: the family's tinted tile with its icon, the label, and the
 * technical key in mono below (Shopkart `job-types.tsx`). */
export const JobCell = ({
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
			<span
				className="flex size-7 shrink-0 items-center justify-center rounded-[7px] shadow-[inset_0_0_0_1px_var(--border)]"
				style={{ background: JOB_FAMILY_META[job.family].tint }}
			>
				<Icon aria-hidden="true" className="size-3.5" />
			</span>
			<span className="flex min-w-0 flex-col leading-tight">
				<span className="truncate font-medium">{label}</span>
				<span className="truncate font-mono text-[11px] text-muted-foreground">
					{job.key}
				</span>
			</span>
		</span>
	);
};

const everyMinutes = (minute: string): string | null => {
	for (const prefix of ['*/', '0/']) {
		if (minute.startsWith(prefix)) {
			const value = minute.slice(prefix.length);
			return /^\d+$/.test(value) ? value : null;
		}
	}
	return null;
};

/** Quartz cron (`s m h * * ?`) as a sentence (§4.8). */
export const cronText = (t: Translate, expression: string | null): string => {
	const raw = expression?.trim() ?? '';
	if (raw.length === 0) {
		return t('common:no-value');
	}

	const parts = raw.split(/\s+/);
	if (parts.length < 3) {
		return raw;
	}

	const minute = parts[1];
	const hour = parts[2];
	if (minute === '*' && hour === '*') {
		return t('staff-jobs:jobs-cron-every-minute');
	}

	const every = everyMinutes(minute);
	if (every !== null && hour === '*') {
		return t('staff-jobs:jobs-cron-every-n-minutes', { count: every });
	}
	if (hour === '*') {
		return t('staff-jobs:jobs-cron-hourly-at', {
			minute: minute.padStart(2, '0'),
		});
	}
	if (minute === '0') {
		return t('staff-jobs:jobs-cron-daily', { hour });
	}

	return t('staff-jobs:jobs-cron-daily-at', {
		hour,
		minute: minute.padStart(2, '0'),
	});
};

/** The dead-letter triage state, derived from the row's own timestamps. */
export type DeadLetterState = 'open' | 'requeued' | 'triaged';

export const deadLetterState = (row: {
	requeuedAsJobId: string | null;
	triagedAt: Date | null;
}): DeadLetterState => {
	if (row.requeuedAsJobId) {
		return 'requeued';
	}
	if (row.triagedAt) {
		return 'triaged';
	}
	return 'open';
};

export const DEAD_LETTER_STATE_LABEL = {
	open: 'staff-jobs:jobs-dead-state-open',
	requeued: 'staff-jobs:jobs-dead-state-requeued',
	triaged: 'staff-jobs:jobs-dead-state-triaged',
} satisfies Record<DeadLetterState, string>;
