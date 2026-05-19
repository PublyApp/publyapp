import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import { isServer } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import capitalize from 'lodash/capitalize';
import get from 'lodash/get';
import { data, useParams } from 'react-router';

import type { AuditLogDetail } from '@org/client-ts/src/models';
import { APP_NAME, FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { CustomBreadcrumbs } from '#app/components/custom-breadcrumbs/custom-breadcrumbs.tsx';
import { ErrorContent } from '#app/components/empty-content/error-content.tsx';
import { View400 } from '#app/components/error/400-view.tsx';
import { View404 } from '#app/components/error/404-view.tsx';
import QueryDisplay from '#app/components/query-display.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { DashboardContent } from '#app/layouts/dashboard/content.tsx';
import { isProblemFailure, toApiFailure } from '#app/lib/api-failure/index.ts';
import { useGetStaffAuditLog } from '#app/lib/react-query/features/staff/staff-audit-log.hooks.ts';
import { getServerLoader } from '#app/lib/react-router/server-data.server.ts';

import type { Route } from './+types/staff-audit-log-details-page';
import { AuditLogDetailSectioned } from './_parts/audit-log-detail-sectioned';
import { AuditLogDetailSplit } from './_parts/audit-log-detail-split';
import { AuditLogDetailStacked } from './_parts/audit-log-detail-stacked';
import { AuditLogVariantSwitcher } from './_parts/audit-log-variant-switcher';
import { useAuditLogDetailVariant } from './_parts/use-audit-log-detail-variant';

// ----------------------------------------------------------------------

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = capitalize(t('audit-log-details'));

	if (seo) {
		str = `${str} | Staff Dashboard - ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return get(args.loaderData, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [
		{
			title: getPageTitle(t, true),
		},
	];
};

export const loader = getServerLoader({
	loader: async ({ z }) => {
		const t = z.t;

		return data({
			meta: [
				{
					title: getPageTitle(t, true),
				},
			],
		});
	},
});

// ----------------------------------------------------------------------

const StaffAuditLogDetailsPage = () => {
	const { t } = useTranslate();
	const { logId } = useParams();

	const auditLogQuery = useGetStaffAuditLog({
		variables: { logId: logId ?? '' },
		enabled: !!logId,
	});

	if (!logId) {
		return (
			<View400
				title={capitalize(t('bad-request'))}
				description={capitalize(t('log-id-required'))}
			/>
		);
	}

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
			compact
			maxWidth="lg"
		>
			<CustomBreadcrumbs
				heading={getPageTitle(t as never)}
				links={[
					{
						name: capitalize(t('audit-logs')),
						href: FRONT_PATH_NAMES.staff.auditLogs.root,
					},
					{ name: capitalize(t('details')) },
				]}
				action={<AuditLogVariantSwitcher />}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<QueryDisplay
				query={auditLogQuery}
				LoadingSlot={AuditLogDetailsSkeleton}
				ErrorSlot={AuditLogDetailsError}
				EmptySlot={AuditLogDetailsEmpty}
			>
				{({ data: auditLog }) => (
					<AuditLogDetailDispatcher auditLog={auditLog} />
				)}
			</QueryDisplay>
		</DashboardContent>
	);
};

export default StaffAuditLogDetailsPage;

// ----------------------------------------------------------------------

type AuditLogDetailDispatcherProps = {
	auditLog: AuditLogDetail;
};

const AuditLogDetailDispatcher = ({
	auditLog,
}: AuditLogDetailDispatcherProps) => {
	const [variant] = useAuditLogDetailVariant();

	if (variant === 'sectioned') {
		return <AuditLogDetailSectioned auditLog={auditLog} />;
	}
	if (variant === 'split') {
		return <AuditLogDetailSplit auditLog={auditLog} />;
	}
	return <AuditLogDetailStacked auditLog={auditLog} />;
};

// ----------------------------------------------------------------------

const AuditLogDetailsEmpty = () => {
	const { t } = useTranslate();

	return (
		<View404
			withLayout={false}
			title={capitalize(t('audit-log-not-found-title'))}
			description={t('audit-log-not-found-description')}
		/>
	);
};

// ----------------------------------------------------------------------

const AuditLogDetailsError = ({ error }: { error: unknown }) => {
	const { t } = useTranslate();

	const failure = toApiFailure(error);

	if (
		isProblemFailure(failure) &&
		(failure.status === 404 ||
			(failure.status === 400 && failure.translationKey === 'malformed-id'))
	) {
		return <AuditLogDetailsEmpty />;
	}

	return (
		<Box sx={{ py: 10 }}>
			<ErrorContent
				title={t('audit-log-details-error-title')}
				description={t('audit-log-details-error-description')}
			/>
		</Box>
	);
};

// ----------------------------------------------------------------------

const AuditLogDetailsSkeleton = () => {
	return (
		<Card>
			<CardHeader
				title={<Skeleton variant="text" width={200} />}
				sx={{ pb: 2 }}
			/>
			<Divider />
			<CardContent>
				<Grid container spacing={2}>
					<Grid size={12}>
						<Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
							<Skeleton variant="circular" width={24} height={24} />
							<Box sx={{ flexGrow: 1 }}>
								<Skeleton variant="text" width="15%" height={16} />
								<Skeleton variant="text" width="40%" height={24} />
							</Box>
						</Box>
					</Grid>
					{[1, 2, 3, 4].map((item) => (
						<Grid key={`skeleton-row-${item}`} size={{ xs: 12, sm: 6 }}>
							<Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
								<Skeleton variant="circular" width={24} height={24} />
								<Box sx={{ flexGrow: 1 }}>
									<Skeleton variant="text" width="40%" height={16} />
									<Skeleton variant="text" width="70%" height={24} />
								</Box>
							</Box>
						</Grid>
					))}
				</Grid>
				<Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
					<Skeleton variant="text" width="30%" height={16} />
				</Box>
			</CardContent>
		</Card>
	);
};
