import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { isServer } from '@tanstack/react-query';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
} from 'material-react-table';
import { useMemo } from 'react';
import { data, useParams } from 'react-router';

import { APP_NAME, FRONT_PATH_NAMES } from '@org/shared/lib/constants';
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { EmptyContent } from '@/front/components/empty-content/empty-content';
import { Iconify } from '@/front/components/iconify/iconify';
import type { LabelColor } from '@/front/components/label';
import { Label } from '@/front/components/label/label';
import { RouterLink } from '@/front/components/router-link';
import { useMRTTable } from '@/front/hooks/use-mrt-table';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';

import type { Route } from './+types/tenant-settings-invitations-page';

// Enable dayjs relative time plugin
dayjs.extend(relativeTime);

// Invitation Status Enum
const INVITATION_STATUS_ENUM = {
	PENDING: 'Pending',
	ACCEPTED: 'Accepted',
	EXPIRED: 'Expired',
	REVOKED: 'Revoked',
} as const;

type InvitationStatus =
	(typeof INVITATION_STATUS_ENUM)[keyof typeof INVITATION_STATUS_ENUM];

// Row Data Type
export type TenantInvitationRowData = {
	id: string;
	email: string;
	profileName: string;
	sentAt: string;
	expiresAt: string;
	status: InvitationStatus;
};

// Column Helper
const columnHelper = createMRTColumnHelper<TenantInvitationRowData>();

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(t('invitations'));

	if (seo) {
		str = `${str} | Tenant Settings - ${APP_NAME}`;
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

const TenantSettingsInvitationsPage = () => {
	const { t } = useTranslate();
	const { tenantId } = useParams<{ tenantId: string }>();

	// Column definitions
	const columns = useMemo(() => {
		return [
			columnHelper.accessor('email', {
				header: _.capitalize(t('email')),
				size: 250,
			}),
			columnHelper.accessor('profileName', {
				header: _.capitalize(t('profile')),
				size: 150,
			}),
			columnHelper.accessor('sentAt', {
				header: _.capitalize(t('sent-date')),
				size: 150,
				Cell: SentDateCell,
			}),
			columnHelper.accessor('expiresAt', {
				header: _.capitalize(t('expiry-date')),
				size: 150,
				Cell: ExpiryDateCell,
			}),
			columnHelper.accessor('status', {
				header: _.capitalize(t('status')),
				size: 120,
				Cell: StatusCell,
			}),
			columnHelper.display({
				id: 'actions',
				header: _.capitalize(t('actions')),
				size: 120,
				Cell: ActionsCell,
			}),
		];
	}, [t]);

	// Empty data for now - no API integration yet
	const dataTable: TenantInvitationRowData[] = [];

	// Table configuration
	const table = useMRTTable('minimal', {
		columns,
		data: dataTable,
		state: {
			density: 'compact',
			isLoading: false,
		},
		renderEmptyRowsFallback: () => (
			<EmptyContent
				title={t('no-items-found', { item: t('invitations') })}
				description={t('create-first-item', { item: t('invitation') })}
				sx={{
					minHeight: 400,
				}}
			/>
		),
		muiTablePaperProps: {
			sx: {
				flexGrow: 1,
			},
		},
	});

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
		>
			<CustomBreadcrumbs
				heading={getPageTitle(t as never)}
				links={[
					{
						name: _.capitalize(t('dashboard')),
						href: FRONT_PATH_NAMES.tenant(tenantId).root,
					},
					{
						name: _.capitalize(t('settings')),
					},
					{ name: _.capitalize(t('invitations')) },
				]}
				action={
					<Button
						component={RouterLink}
						href={FRONT_PATH_NAMES.tenant(tenantId).settings.invitations.new}
						variant="contained"
						startIcon={<Iconify icon="mingcute:add-line" />}
					>
						{t('new-invitation')}
					</Button>
				}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<Box
				sx={{
					flexGrow: 1,
					display: 'flex',
					flexDirection: 'column',
					border: 'none',
				}}
			>
				<MaterialReactTable table={table} />
			</Box>
		</DashboardContent>
	);
};

export default TenantSettingsInvitationsPage;

// ----------------------------------------------------------------------

const SentDateCell: MRT_ColumnDef<TenantInvitationRowData, string>['Cell'] = (
	props,
) => {
	const sentAt = props.cell.getValue();

	if (!sentAt) {
		return <Typography variant="body2">-</Typography>;
	}

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column' }}>
			<Typography variant="body2">
				{dayjs(sentAt).format('MMM DD, YYYY')}
			</Typography>
			<Typography variant="caption" sx={{ color: 'text.secondary' }}>
				{dayjs(sentAt).fromNow()}
			</Typography>
		</Box>
	);
};

const ExpiryDateCell: MRT_ColumnDef<TenantInvitationRowData, string>['Cell'] = (
	props,
) => {
	const { t } = useTranslate();
	const expiresAt = props.cell.getValue();

	if (!expiresAt) {
		return <Typography variant="body2">-</Typography>;
	}

	const isExpired = dayjs(expiresAt).isBefore(dayjs());

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column' }}>
			<Typography
				variant="body2"
				sx={{ color: isExpired ? 'error.main' : 'text.primary' }}
			>
				{dayjs(expiresAt).format('MMM DD, YYYY')}
			</Typography>
			<Typography
				variant="caption"
				sx={{ color: isExpired ? 'error.main' : 'text.secondary' }}
			>
				{isExpired ? t('expired') : dayjs(expiresAt).fromNow()}
			</Typography>
		</Box>
	);
};

const StatusCell: MRT_ColumnDef<
	TenantInvitationRowData,
	InvitationStatus
>['Cell'] = (props) => {
	const { t } = useTranslate();
	const status = props.cell.getValue();

	let label: string = t('unknown-item', { item: 'status' });
	let color: LabelColor = 'default';

	if (status === INVITATION_STATUS_ENUM.PENDING) {
		label = t('pending');
		color = 'warning';
	} else if (status === INVITATION_STATUS_ENUM.ACCEPTED) {
		label = t('accepted');
		color = 'success';
	} else if (status === INVITATION_STATUS_ENUM.EXPIRED) {
		label = t('expired');
		color = 'error';
	} else if (status === INVITATION_STATUS_ENUM.REVOKED) {
		label = t('revoked');
		color = 'default';
	}

	return (
		<Label variant="soft" color={color}>
			{label}
		</Label>
	);
};

const ActionsCell: MRT_ColumnDef<TenantInvitationRowData>['Cell'] = (props) => {
	const { t } = useTranslate();
	const status = props.row.original.status;

	const canResend =
		status === INVITATION_STATUS_ENUM.PENDING ||
		status === INVITATION_STATUS_ENUM.EXPIRED;
	const canRevoke = status === INVITATION_STATUS_ENUM.PENDING;

	return (
		<Box sx={{ display: 'flex', alignItems: 'center' }}>
			{canResend && (
				<Tooltip title={t('resend-invitation')} placement="top" arrow>
					<IconButton color="default" size="small">
						<Iconify icon="solar:letter-bold" />
					</IconButton>
				</Tooltip>
			)}

			{canRevoke && (
				<Tooltip title={t('revoke-invitation')} placement="top" arrow>
					<IconButton color="default" size="small" sx={{ color: 'error.main' }}>
						<Iconify icon="solar:close-circle-bold" />
					</IconButton>
				</Tooltip>
			)}
		</Box>
	);
};
