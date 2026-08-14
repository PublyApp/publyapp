import {
	IconAlertCircle,
	IconArrowLeft,
	IconHelpCircle,
} from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import QueryDisplay from '~/components/query-display';
import { Button, buttonVariants } from '~/components/ui/button';
import { useStaffAuditLogDetailsQuery } from '~/lib/query/staff-audit-logs';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

import {
	AuditLogActor,
	AuditLogContextGrid,
	AuditLogDetailHero,
	AuditLogDetailSection,
	AuditLogPayload,
} from './_audit-log-detail-parts';

const NOT_FOUND_TRANSLATION_KEY = 'malformed-id';
const AUDIT_LOGS_LIST_PATH = '/staff/audit-logs';

const isProblemStatus = (
	error: unknown,
	status: number,
	translationKey?: string,
): boolean => {
	const failure = toApiFailure(error);
	if (failure.kind !== 'problem') {
		return false;
	}

	if (failure.status !== status) {
		return false;
	}

	return (
		translationKey === undefined || failure.translationKey === translationKey
	);
};

const AuditLogDetailsLoading = () => (
	<div className="space-y-4" data-testid="staff-audit-log-details-loading">
		<div className="h-6 w-40 animate-pulse rounded bg-muted" />
		<div className="h-24 animate-pulse rounded bg-muted" />
		<div className="grid gap-3 md:grid-cols-2">
			<div className="h-20 animate-pulse rounded bg-muted" />
			<div className="h-20 animate-pulse rounded bg-muted" />
			<div className="h-20 animate-pulse rounded bg-muted" />
			<div className="h-20 animate-pulse rounded bg-muted" />
		</div>
		<div className="h-40 animate-pulse rounded bg-muted" />
	</div>
);

const AuditLogDetailsEmpty = () => {
	const { t } = useTranslation(['staff-audit-logs', 'common']);

	return (
		<AppErrorView
			icon={<IconHelpCircle aria-hidden="true" className="size-7" />}
			code={t('common:error-404-code')}
			title={t('common:audit-log-not-found-title')}
			description={t('common:audit-log-not-found-description')}
			testId="staff-audit-log-details-not-found"
			actions={
				<Link
					to={AUDIT_LOGS_LIST_PATH}
					className={buttonVariants({ variant: 'outline' })}
				>
					{t('back-to-audit-logs')}
				</Link>
			}
		/>
	);
};

const AuditLogDetailsError = ({
	error,
	onRetry,
}: {
	error: unknown;
	onRetry: () => void;
}) => {
	const { t } = useTranslation(['staff-audit-logs', 'common']);

	if (
		isProblemStatus(error, 404) ||
		isProblemStatus(error, 400, NOT_FOUND_TRANSLATION_KEY)
	) {
		return <AuditLogDetailsEmpty />;
	}

	if (isProblemStatus(error, 403)) {
		return <View403 />;
	}

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('common:error-500-code')}
			title={t('common:audit-log-details-error-title')}
			description={t('common:audit-log-details-error-description')}
			testId="staff-audit-log-details-error"
			actions={
				<>
					<Button variant="default" onClick={onRetry} type="button">
						{t('common:try-again')}
					</Button>
					<Link
						to={AUDIT_LOGS_LIST_PATH}
						className={buttonVariants({ variant: 'outline' })}
					>
						{t('back-to-audit-logs')}
					</Link>
				</>
			}
		/>
	);
};

export const Route = createFileRoute('/_authed-layout/staff/audit-logs/$logId')(
	{
		staticData: {
			i18nNamespaces: ['staff-audit-logs'],
			crumbs: () => [
				{
					kind: 'label',
					labelKey: 'nav-staff-audit-logs',
					to: AUDIT_LOGS_LIST_PATH,
				},
				{ kind: 'label', labelKey: 'common:details' },
			],
		},
		component: StaffAuditLogDetailsRoute,
	},
);

function StaffAuditLogDetailsRoute() {
	const { logId } = Route.useParams();

	return <StaffAuditLogDetailsPage logId={logId} />;
}

export function StaffAuditLogDetailsPage({ logId }: { logId: string }) {
	const { t, i18n } = useTranslation(['staff-audit-logs', 'common']);
	const locale = i18n?.language ?? 'en';
	const detailQuery = useStaffAuditLogDetailsQuery(
		{ logId },
		{ enabled: logId.length > 0 },
	);

	if (detailQuery.isError && shouldLogoutForFailure(detailQuery.error)) {
		return <LogoutRedirect />;
	}

	return (
		<div
			className="publy-detail-page space-y-5"
			data-testid="staff-audit-log-details-page"
		>
			<div className="space-y-3">
				<Link to={AUDIT_LOGS_LIST_PATH} className="publy-back-link">
					<IconArrowLeft aria-hidden="true" className="size-3" />
					{t('back-to-audit-logs')}
				</Link>
			</div>
			<QueryDisplay
				query={detailQuery}
				LoadingSlot={AuditLogDetailsLoading}
				ErrorSlot={({ error }) => (
					<AuditLogDetailsError
						error={error}
						onRetry={() => void detailQuery.refetch()}
					/>
				)}
				EmptySlot={AuditLogDetailsEmpty}
			>
				{({ data }) => (
					<div className="space-y-4">
						<h1 className="publy-type-page-title">
							{t('common:audit-log-details')}
						</h1>
						<AuditLogDetailSection title={t('event')}>
							<AuditLogDetailHero auditLog={data} locale={locale} />
						</AuditLogDetailSection>
						<AuditLogDetailSection title={t('common:user')}>
							<AuditLogActor auditLog={data} />
						</AuditLogDetailSection>
						<AuditLogDetailSection title={t('common:details')}>
							<AuditLogContextGrid auditLog={data} />
						</AuditLogDetailSection>
						<AuditLogPayload details={data.details} />
					</div>
				)}
			</QueryDisplay>
		</div>
	);
}
