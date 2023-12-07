// @mui
import { Box, Card, Divider, Skeleton, Stack, type CardProps } from '@mui/material';
import { nanoid } from 'nanoid';

// ----------------------------------------------------------------------
const AwesomeToolItemSkeleton = ({ ...other }: CardProps) => {
	return (
		<Card {...other}>
			<Stack spacing={2} sx={{ p: 3 }}>
				<Skeleton variant="circular" width={48} height={48} />

				{[...Array(4)].map((_, index) => {
					return (
						<Skeleton
							key={nanoid()}
							variant="text"
							sx={{
								height: 20 - index * 2,
								width: (5 - index) * 50,
							}}
						/>
					);
				})}
			</Stack>

			<Divider sx={{ borderStyle: 'dashed' }} />

			<Box
				sx={{
					p: 3,
					gap: 3,
					display: 'grid',
					gridTemplateColumns: 'repeat(2, 1fr)',
				}}
			>
				{[...Array(4)].map(() => {
					return <Skeleton key={nanoid()} variant="rectangular" sx={{ width: 1, height: 20, borderRadius: 0.5 }} />;
				})}
			</Box>
		</Card>
	);
};

export default AwesomeToolItemSkeleton;
