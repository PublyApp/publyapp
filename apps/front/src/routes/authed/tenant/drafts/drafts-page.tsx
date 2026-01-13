import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { useState } from 'react';
import { data, useParams } from 'react-router';

import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { EmptyContent } from '@/front/components/empty-content/empty-content';
import { Iconify } from '@/front/components/iconify/iconify';
import { RouterLink } from '@/front/components/router-link';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { APP_NAME, FRONT_PATH_NAMES, isServer } from '@/shared/lib/constants';

import type { Route } from './+types/drafts-page';

// ----------------------------------------------------------------------

type SortOption = 'lastModified' | 'createdDate';

const getPageTitle = (t: TFunction) => {
	return _.capitalize(t('drafts'));
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.loaderData, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [
		{
			title: `${getPageTitle(t)} | ${APP_NAME}`,
		},
	];
};

export const loader = getServerLoader({
	loader: async ({ z }) => {
		const t = z.t;

		return data({
			meta: [
				{
					title: `${getPageTitle(t)} | ${APP_NAME}`,
				},
			],
		});
	},
});

// ----------------------------------------------------------------------

const DraftsPage = () => {
	const { t } = useTranslate();
	const { tenantId } = useParams();
	const [sortBy, setSortBy] = useState<SortOption>('lastModified');

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
					{ name: _.capitalize(t('drafts')) },
				]}
				action={
					<Button
						component={RouterLink}
						href={FRONT_PATH_NAMES.tenant(tenantId).posts.new}
						variant="contained"
						startIcon={<Iconify icon="mingcute:add-line" />}
					>
						{_.capitalize(t('create-draft'))}
					</Button>
				}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<Card sx={{ mb: 3 }}>
				<CardContent>
					<Box
						sx={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							flexWrap: 'wrap',
							gap: 2,
						}}
					>
						<Typography variant="subtitle1">{t('sort-by')}</Typography>
						<FormControl size="small" sx={{ minWidth: 200 }}>
							<InputLabel id="sort-by-label">{t('sort-by')}</InputLabel>
							<Select
								labelId="sort-by-label"
								id="sort-by-select"
								value={sortBy}
								label={t('sort-by')}
								onChange={(e) => setSortBy(e.target.value as SortOption)}
							>
								<MenuItem value="lastModified">{t('last-modified')}</MenuItem>
								<MenuItem value="createdDate">{t('created-date')}</MenuItem>
							</Select>
						</FormControl>
					</Box>
				</CardContent>
			</Card>

			<Card
				sx={{
					flexGrow: 1,
					display: 'flex',
					flexDirection: 'column',
					minHeight: 400,
				}}
			>
				<CardContent
					sx={{
						flexGrow: 1,
						display: 'flex',
						flexDirection: 'column',
					}}
				>
					<EmptyContent
						filled
						title={t('no-drafts-yet')}
						description={t('drafts-empty-description')}
						sx={{ flexGrow: 1 }}
						action={
							<Button
								component={RouterLink}
								href={FRONT_PATH_NAMES.tenant(tenantId).posts.new}
								variant="contained"
								startIcon={<Iconify icon="mingcute:add-line" />}
								sx={{ mt: 3 }}
							>
								{_.capitalize(t('create-your-first-draft'))}
							</Button>
						}
					/>
				</CardContent>
			</Card>
		</DashboardContent>
	);
};

export default DraftsPage;
