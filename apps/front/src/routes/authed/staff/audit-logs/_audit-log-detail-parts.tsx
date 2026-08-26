import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '~/components/ui/card';
import { CopyButton } from '~/components/ui/copy-button';
import { PersonAvatar } from '~/components/ui/person-avatar';
import { StatusPill } from '~/components/ui/product-page';
import { formatDateTime } from '~/lib/format-date-time';
import { cn } from '~/lib/utils';

import type { AuditLogDetail } from '@org/client-ts/models/index';

import {
	auditActionKindLabel,
	categorizeAuditAction,
} from './_audit-log-action-category';

export const AuditLogDetailHero = ({
	auditLog,
	locale,
}: {
	auditLog: AuditLogDetail;
	locale: string;
}) => {
	const { t } = useTranslation(['staff-audit-logs', 'common']);
	const { kind, tone } = categorizeAuditAction(auditLog.action);

	return (
		<div className="space-y-3">
			<StatusPill tone={tone}>{auditActionKindLabel(t, kind)}</StatusPill>
			<p className="break-all font-mono text-xl leading-snug text-foreground">
				{/* data-honesty-ignore: a legacy audit row's missing action key renders as a no-value dash, not fabricated identity data */}
				{auditLog.action || '-'}
			</p>
			{auditLog.createdAt ? (
				<p className="text-sm text-muted-foreground">
					{formatDateTime(auditLog.createdAt, locale)}
				</p>
			) : null}
		</div>
	);
};

export const AuditLogActor = ({ auditLog }: { auditLog: AuditLogDetail }) => {
	const { t } = useTranslation(['staff-audit-logs', 'common']);

	return (
		<div>
			<p className="publy-type-metadata-label">{t('common:user')}</p>
			<div className="mt-1.5 flex items-center gap-2.5">
				<PersonAvatar
					name={auditLog.userName?.trim() || '?'}
					size="sm"
					accessibleLabel={t('actor-avatar-label')}
				/>
				<div className="min-w-0">
					<p className="truncate text-sm font-medium text-foreground">
						{/* data-honesty-ignore: a deleted user's identity is genuinely absent, so the no-value dash is not fabricated identity data */}
						{auditLog.userName || '-'}
					</p>
					<p className="truncate text-xs text-muted-foreground">
						{/* data-honesty-ignore: a deleted user's identity is genuinely absent, so the no-value dash is not fabricated identity data */}
						{auditLog.userEmail || '-'}
					</p>
				</div>
			</div>
		</div>
	);
};

type AuditLogContextField = 'ip' | 'userAgent' | 'targetId' | 'eventId';

const AuditLogContextCell = ({
	label,
	value,
	mono,
	testId,
}: {
	label: string;
	value: string;
	mono: boolean;
	testId?: string;
}) => (
	<div className="space-y-1 rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] p-4 shadow-[var(--publy-shadow-ring)]">
		<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
			{label}
		</p>
		<div className="flex min-w-0 items-center gap-1.5">
			<span
				className={cn(
					'min-w-0 truncate text-sm',
					mono ? 'font-mono text-muted-foreground' : 'text-foreground',
				)}
				data-testid={testId}
			>
				{value}
			</span>
			<CopyButton
				value={value}
				label={label}
				testId={testId ? `${testId}-copy` : undefined}
			/>
		</div>
	</div>
);

const DASH = '-';

export const AuditLogContextGrid = ({
	auditLog,
}: {
	auditLog: AuditLogDetail;
}) => {
	const { t } = useTranslation(['staff-audit-logs', 'common']);
	const cells: Array<{
		key: AuditLogContextField;
		label: string;
		value: string;
		mono: boolean;
	}> = [
		{
			key: 'ip',
			label: t('common:ip-address'),
			value: auditLog.ipAddress || DASH,
			mono: true,
		},
		{
			key: 'userAgent',
			label: t('common:user-agent'),
			value: auditLog.userAgent || DASH,
			mono: false,
		},
		{
			key: 'targetId',
			label: t('common:target-id'),
			value: auditLog.targetId ? String(auditLog.targetId) : DASH,
			mono: true,
		},
		{
			key: 'eventId',
			label: t('common:event-id'),
			value: auditLog.id ? String(auditLog.id) : DASH,
			mono: true,
		},
	];

	return (
		<div className="grid gap-3 md:grid-cols-2">
			{cells.map((cell) => (
				<AuditLogContextCell
					key={cell.key}
					label={cell.label}
					value={cell.value}
					mono={cell.mono}
					testId={`audit-log-context-${cell.key}`}
				/>
			))}
		</div>
	);
};

// react-doctor-disable-next-line only-export-components -- tightly-coupled utility; sole consumer is AuditLogPayload in this same file
const formatAuditLogPayload = (raw: string): string => {
	try {
		return JSON.stringify(JSON.parse(raw), null, 2);
	} catch {
		return raw;
	}
};

export const AuditLogPayload = ({ details }: { details?: string | null }) => {
	const { t } = useTranslation(['staff-audit-logs', 'common']);

	if (!details?.trim()) {
		return null;
	}

	return (
		<div>
			<p className="publy-type-metadata-label">{t('common:details')}</p>
			{/* Payloads can overflow both axes; make the region focusable so
			 * keyboard users can scroll it (old-front behavior). */}
			<pre
				role="region"
				tabIndex={0}
				aria-label={t('payload-region-label')}
				data-testid="audit-log-payload"
				className="mt-1.5 max-h-90 overflow-auto rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] p-4 font-mono text-xs whitespace-pre text-muted-foreground shadow-[var(--publy-shadow-ring)] outline-none focus-visible:ring-3 focus-visible:ring-ring"
			>
				{formatAuditLogPayload(details)}
			</pre>
		</div>
	);
};

export const AuditLogDetailSection = ({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) => (
	<Card className="space-y-3 p-4">
		<h2 className="text-sm font-semibold text-foreground">{title}</h2>
		{children}
	</Card>
);
