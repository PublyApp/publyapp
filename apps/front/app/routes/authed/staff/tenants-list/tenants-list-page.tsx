import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { varAlpha } from 'minimal-shared/utils';

import { DashboardContent } from '@/front/layouts/dashboard/content';
import { useTranslate } from '@/front/hooks/use-translate';
import _ from 'lodash';

const TenantsListPage = () => {
	const { t } = useTranslate();
	// throw new Error('Not implemented');
	// const { data } = useSuspenseQuery({
	// 	queryKey: ['tenants-qqq'],
	// 	queryFn: async () => {
	// 		try {
	// 			await sleep(3000);
	// 			const val = _.sample([true, false]);
	// 			if (true) {
	// 				throw new Error('Not implemented');
	// 			}
	// 			return Promise.resolve(500);
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
			>
				{t('hello')}
				{/*  ++ {data} */}
			</Box>
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
