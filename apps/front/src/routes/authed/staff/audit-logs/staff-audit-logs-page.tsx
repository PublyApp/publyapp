import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import i18next, { type TFunction } from 'i18next';
import _ from 'lodash';
import { data } from 'react-router';

import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { EmptyContent } from '@/front/components/empty-content/empty-content';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { APP_NAME, FRONT_PATH_NAMES, isServer } from '@/shared/lib/constants';

import type { Route } from './+types/staff-audit-logs-page';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(t('audit-logs'));

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

const StaffAuditLogsPage = () => {
	const { t } = useTranslate();

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
		>
			<CustomBreadcrumbs
				heading={getPageTitle(t as never)}
				links={[
					{
						name: _.capitalize(t('audit-logs')),
						href: FRONT_PATH_NAMES.staff.auditLogs.root,
					},
					{ name: _.capitalize(t('list')) },
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			{/* Filters Section */}
			<Card sx={{ mb: 3 }}>
				<CardContent>
					<Typography variant="subtitle1" sx={{ mb: 2 }}>
						{_.capitalize(t('filters'))}
					</Typography>
					<Stack
						direction={{ xs: 'column', sm: 'row' }}
						spacing={2}
						sx={{ flexWrap: 'wrap' }}
					>
						{/* Date Range Filter - Placeholder */}
						<TextField
							label={t('start-date')}
							type="date"
							disabled
							InputLabelProps={{ shrink: true }}
							sx={{ minWidth: 200 }}
						/>
						<TextField
							label={t('end-date')}
							type="date"
							disabled
							InputLabelProps={{ shrink: true }}
							sx={{ minWidth: 200 }}
						/>

						{/* Action Type Filter - Placeholder */}
						<FormControl sx={{ minWidth: 200 }} disabled>
							<InputLabel>{t('action-type')}</InputLabel>
							<Select label={t('action-type')} value="">
								<MenuItem value="">{t('all')}</MenuItem>
								<MenuItem value="created">{t('created')}</MenuItem>
								<MenuItem value="updated">{t('updated')}</MenuItem>
								<MenuItem value="deleted">{t('deleted')}</MenuItem>
							</Select>
						</FormControl>

						{/* User Filter - Placeholder */}
						<FormControl sx={{ minWidth: 200 }} disabled>
							<InputLabel>{t('user')}</InputLabel>
							<Select label={t('user')} value="">
								<MenuItem value="">{t('all')}</MenuItem>
							</Select>
						</FormControl>

						{/* Resource Type Filter - Placeholder */}
						<FormControl sx={{ minWidth: 200 }} disabled>
							<InputLabel>{t('resource-type')}</InputLabel>
							<Select label={t('resource-type')} value="">
								<MenuItem value="">{t('all')}</MenuItem>
								<MenuItem value="tenant">{t('tenant')}</MenuItem>
								<MenuItem value="user">{t('user')}</MenuItem>
								<MenuItem value="profile">{t('profile')}</MenuItem>
								<MenuItem value="invitation">{t('invitation')}</MenuItem>
							</Select>
						</FormControl>
					</Stack>
				</CardContent>
			</Card>

			{/* Audit Logs Table */}
			<Card sx={{ flexGrow: 1 }}>
				<TableContainer>
					<Table>
						<TableHead>
							<TableRow>
								<TableCell>{t('timestamp')}</TableCell>
								<TableCell>{t('user')}</TableCell>
								<TableCell>{t('action-type')}</TableCell>
								<TableCell>{t('resource-type')}</TableCell>
								<TableCell>{t('details')}</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{/* Empty state - no data yet */}
							<TableRow>
								<TableCell colSpan={5}>
									<Box sx={{ py: 10 }}>
										<EmptyContent
											title={t('no-audit-logs-yet')}
											description={t('no-audit-logs-description')}
											filled
										/>
									</Box>
								</TableCell>
							</TableRow>
						</TableBody>
					</Table>
				</TableContainer>
			</Card>
		</DashboardContent>
	);
};

export default StaffAuditLogsPage;
