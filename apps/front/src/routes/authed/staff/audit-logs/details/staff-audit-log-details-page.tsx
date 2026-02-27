import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { isServer } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { data, useParams } from 'react-router';

import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { EmptyContent } from '@/front/components/empty-content/empty-content';
import { ErrorContent } from '@/front/components/empty-content/error-content';
import View400 from '@/front/components/error/400-view';
import { Iconify } from '@/front/components/iconify/iconify';
import type { IconifyName } from '@/front/components/iconify/register-icons';
import QueryDisplay from '@/front/components/query-display';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { isProblemFailure, toApiFailure } from '@/front/lib/api-failure';
import { useGetStaffAuditLog } from '@/front/lib/react-query/features/staff/staff-audit-log.hooks';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { fDateTime, fToNow } from '@/front/utils/format-time';
import type { AuditLogDetail } from '@org/client-ts/src/models';
import { APP_NAME, FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import type { Route } from './+types/staff-audit-log-details-page';

// ----------------------------------------------------------------------

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(t('audit-log-details'));

	if (seo) {
		str = `${str} | Staff Dashboard - ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.loaderData, 'meta', []);
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
				title={_.capitalize(t('bad-request'))}
				description={_.capitalize(t('log-id-required'))}
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
						name: _.capitalize(t('audit-logs')),
						href: FRONT_PATH_NAMES.staff.auditLogs.root,
					},
					{ name: _.capitalize(t('details')) },
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<QueryDisplay
				query={auditLogQuery}
				LoadingSlot={AuditLogDetailsSkeleton}
				ErrorSlot={AuditLogDetailsError}
				EmptySlot={AuditLogDetailsEmpty}
			>
				{({ data: auditLog }) => (
					<AuditLogDetailsContent logId={logId} auditLog={auditLog} />
				)}
			</QueryDisplay>
		</DashboardContent>
	);
};

export default StaffAuditLogDetailsPage;

// ----------------------------------------------------------------------

const AuditLogDetailsEmpty = () => {
	const { t } = useTranslate();

	return (
		<Box sx={{ py: 10 }}>
			<EmptyContent
				title={_.capitalize(
					t('no-items-found', {
						item: t('audit-log'),
						ns: 'response-message',
					}),
				)}
				imgUrl="/assets/icons/empty/ic-content.svg"
			/>
		</Box>
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
				title={t('error-loading-items', {
					item: t('audit-log'),
					ns: 'response-message',
				})}
			/>
		</Box>
	);
};

// ----------------------------------------------------------------------

type AuditLogDetailsContentProps = {
	logId: string;
	auditLog: AuditLogDetail;
};

const AuditLogDetailsContent = ({
	logId,
	auditLog,
}: AuditLogDetailsContentProps) => {
	const { t } = useTranslate();

	const formattedDetails = (() => {
		if (!auditLog.details) {
			return null;
		}
		try {
			return JSON.stringify(JSON.parse(auditLog.details), null, 2);
		} catch {
			return auditLog.details;
		}
	})();

	return (
		<Card sx={{ width: 800, maxWidth: '100%', mx: 'auto' }}>
			<CardHeader title={_.capitalize(t('audit-log-details'))} sx={{ pb: 2 }} />
			<Divider />
			<CardContent>
				<Grid container spacing={2}>
					{/* Action - full width */}
					<Grid size={12}>
						<DetailRow
							label={t('action')}
							value={
								<Typography
									variant="subtitle1"
									sx={{ fontFamily: 'monospace' }}
								>
									{auditLog.action || '-'}
								</Typography>
							}
							icon="solar:shield-check-bold"
						/>
					</Grid>

					{/* User */}
					<Grid size={{ xs: 12, sm: 6 }}>
						<DetailRow
							label={t('user')}
							value={
								<Box>
									<Typography variant="subtitle1">
										{auditLog.userName || '-'}
									</Typography>
									<Typography
										variant="caption"
										sx={{ color: 'text.secondary' }}
									>
										{auditLog.userEmail || '-'}
									</Typography>
								</Box>
							}
							icon="solar:user-rounded-bold"
						/>
					</Grid>

					{/* Date */}
					<Grid size={{ xs: 12, sm: 6 }}>
						<DetailRow
							label={t('created-at')}
							value={
								auditLog.createdAt ? (
									<Box>
										<Typography variant="subtitle1">
											{fDateTime(auditLog.createdAt)}
										</Typography>
										<Typography
											variant="caption"
											sx={{ color: 'text.secondary' }}
										>
											{fToNow(auditLog.createdAt)}
										</Typography>
									</Box>
								) : (
									'-'
								)
							}
							icon="solar:calendar-date-bold"
						/>
					</Grid>

					{/* IP Address */}
					<Grid size={{ xs: 12, sm: 6 }}>
						<DetailRow
							label={t('ip-address')}
							value={auditLog.ipAddress || '-'}
							icon="solar:globe-bold-duotone"
						/>
					</Grid>

					{/* User Agent */}
					<Grid size={{ xs: 12, sm: 6 }}>
						<DetailRow
							label={t('user-agent')}
							value={auditLog.userAgent || '-'}
							icon="solar:monitor-bold"
						/>
					</Grid>

					{/* Target ID */}
					{auditLog.targetId && (
						<Grid size={12}>
							<DetailRow
								label={t('target-id')}
								value={
									<Typography
										variant="body2"
										sx={{
											fontFamily: 'monospace',
											fontSize: '0.8rem',
										}}
									>
										{auditLog.targetId}
									</Typography>
								}
								icon="solar:document-text-bold-duotone"
							/>
						</Grid>
					)}

					{/* Details JSON */}
					{formattedDetails && (
						<Grid size={12}>
							<DetailRow
								label={t('details')}
								value={
									<Box
										component="pre"
										sx={{
											mt: 0.5,
											p: 1.5,
											borderRadius: 1,
											bgcolor: 'background.neutral',
											fontFamily: 'monospace',
											fontSize: '0.8rem',
											overflow: 'auto',
											maxHeight: 300,
											whiteSpace: 'pre-wrap',
											wordBreak: 'break-word',
										}}
									>
										{formattedDetails}
									</Box>
								}
								icon="solar:document-text-bold-duotone"
							/>
						</Grid>
					)}
				</Grid>

				{/* ID at the bottom */}
				<Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
					<Typography variant="caption" color="text.disabled">
						{`ID: ${logId}`}
					</Typography>
				</Box>
			</CardContent>
		</Card>
	);
};

// ----------------------------------------------------------------------

type DetailRowProps = {
	label: string;
	value: React.ReactNode;
	icon: IconifyName;
};

const DetailRow = ({ label, value, icon }: DetailRowProps) => {
	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'flex-start',
				gap: 2,
			}}
		>
			<Iconify
				icon={icon}
				width={24}
				sx={{ color: 'text.secondary', flexShrink: 0, mt: 0.5 }}
			/>
			<Box sx={{ flexGrow: 1 }}>
				<Typography variant="body2" color="text.secondary">
					{_.capitalize(label)}
				</Typography>
				{typeof value === 'string' ? (
					<Typography variant="subtitle1">{value}</Typography>
				) : (
					<Box sx={{ mt: 0.5 }}>{value}</Box>
				)}
			</Box>
		</Box>
	);
};

// ----------------------------------------------------------------------

const AuditLogDetailsSkeleton = () => {
	return (
		<Card sx={{ width: 800, maxWidth: '100%', mx: 'auto' }}>
			<CardHeader
				title={<Skeleton variant="text" width={200} />}
				sx={{ pb: 2 }}
			/>
			<Divider />
			<CardContent>
				<Grid container spacing={2}>
					{/* Action - full width */}
					<Grid size={12}>
						<Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
							<Skeleton variant="circular" width={24} height={24} />
							<Box sx={{ flexGrow: 1 }}>
								<Skeleton variant="text" width="15%" height={16} />
								<Skeleton variant="text" width="40%" height={24} />
							</Box>
						</Box>
					</Grid>

					{/* Two column rows */}
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

				{/* Footer */}
				<Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
					<Skeleton variant="text" width="30%" height={16} />
				</Box>
			</CardContent>
		</Card>
	);
};
