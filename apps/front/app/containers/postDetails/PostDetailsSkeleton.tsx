import { Skeleton, Stack, type StackProps } from '@mui/material';

const PostDetailsSkeleton = ({ ...other }: StackProps) => {
	return (
		<Stack {...other}>
			<Skeleton variant="rectangular" sx={{ height: 480 }} />

			<Stack sx={{ width: 1, maxWidth: 720, mx: 'auto' }}>
				<Stack spacing={2} direction="row" alignItems="center" sx={{ my: 8 }}>
					<Skeleton variant="circular" sx={{ width: 64, height: 64, flexShrink: 0 }} />

					<Stack spacing={1} flexGrow={1}>
						<Skeleton height={10} />
						<Skeleton height={10} sx={{ width: 0.9 }} />
						<Skeleton height={10} sx={{ width: 0.8 }} />
					</Stack>
				</Stack>

				<Skeleton sx={{ height: 720 }} />
			</Stack>
		</Stack>
	);
};

export default PostDetailsSkeleton;
