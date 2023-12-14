import { Box, Pagination } from '@mui/material';
import { nanoid } from 'nanoid';

// import { CareerJobItem, CareerJobItemSkeleton } from '../item';
// import type { IJobProps } from 'src/types/job';

import { _jobs } from '@/front/_mock';
import useFakeLoading from '@/ui-react/hooks/useFakeLoading';
import type { IJobProps } from '@/ui-react/types/job';

import AwesomeToolItem from './AwesomeToolItem';
import AwesomeToolItemSkeleton from './AwesomeToolItemSkeleton';

// ----------------------------------------------------------------------

// type Props = {
// 	jobs: IJobProps[];
// 	loading?: boolean;
// };

const AwesomeToolsList = (/* { jobs, loading }: Props */) => {
	const loading = useFakeLoading();
	const tools: IJobProps[] = _jobs;

	return (
		<>
			<Box
				sx={{
					columnGap: 4,
					display: 'grid',
					rowGap: { xs: 4, md: 5 },
					gridTemplateColumns: {
						xs: 'repeat(1, 1fr)',
						sm: 'repeat(2, 1fr)',
						md: 'repeat(3, 1fr)',
					},
				}}
			>
				{(loading ? [...Array<IJobProps>(9)] : tools).map((job) => {
					return !loading ? <AwesomeToolItem key={job.id} job={job} /> : <AwesomeToolItemSkeleton key={nanoid()} />;
				})}
			</Box>

			<Pagination
				count={10}
				color="primary"
				size="large"
				sx={{
					my: 10,
					'& .MuiPagination-ul': {
						justifyContent: 'center',
					},
				}}
			/>
		</>
	);
};

export default AwesomeToolsList;
