import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { varAlpha } from 'minimal-shared/utils';

import { DashboardContent } from '@/front/layouts/dashboard/content';
import { useQuery } from '@tanstack/react-query';
import { sleep } from '@/shared/utils/any.utils';
import { t } from 'i18next';

const TenantsListPage = () => {
	// throw new Error('Not implemented');
	// useQuery({
	// 	queryKey: ['tenants-qqq'],
	// 	queryFn: async () => {
	// 		try {
	// 			sleep(3000);
	// 			throw new Error('Not implemented');
	// 		} catch (error) {
	// 			return Promise.reject(error);
	// 		}
	// 	},
	// });
	const renderContent = () => {
		return (
			<Box
				sx={[
					(theme) => {
						return {
							mt: 5,
							width: 1,
							height: 320,
							borderRadius: 2,
							border: `dashed 1px ${theme.vars.palette.divider}`,
							bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.04),
						};
					},
					// ...(Array.isArray(sx) ? sx : [sx]),
				]}
			/>
		);
	};

	return (
		<DashboardContent maxWidth="xl">
			<Typography variant="h4">Tenants</Typography>
			{renderContent()}
		</DashboardContent>
	);
};

export default TenantsListPage;
