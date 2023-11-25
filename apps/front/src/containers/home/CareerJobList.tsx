import { Box, Pagination } from '@mui/material';
import { nanoid } from 'nanoid';

import type { IJobProps } from '@devist/ui-react/types/job';

import CareerJobItem from './CareerJobItem';
import CareerJobItemSkeleton from './CareerJobItemSkeleton';

// ----------------------------------------------------------------------

type Props = {
	jobs: IJobProps[];
	loading?: boolean;
};

const CareerJobList = ({ jobs, loading }: Props) => {
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
				{(loading ? [...Array(9)] : jobs).map((job) => {
					return job ? <CareerJobItem key={job.id} job={job} /> : <CareerJobItemSkeleton key={nanoid()} />;
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

export default CareerJobList;
