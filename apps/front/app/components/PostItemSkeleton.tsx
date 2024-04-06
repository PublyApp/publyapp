import { Paper, Skeleton, Stack, type StackProps } from '@mui/material';

// ----------------------------------------------------------------------

type PostItemSkeletonProps = StackProps & {
	variant?: 'vertical' | 'horizontal';
};

const PostItemSkeleton = ({ variant = 'vertical', sx, ...other }: PostItemSkeletonProps) => {
	if (variant === 'horizontal') {
		return (
			<Stack
				component={Paper}
				direction="row"
				variant="outlined"
				sx={{
					borderRadius: 2,
					...sx,
				}}
				{...other}
			>
				<Stack sx={{ p: 1 }}>
					<Skeleton sx={{ width: 180, height: 240, flexShrink: 0 }} />
				</Stack>

				<Stack spacing={2} flexGrow={1} sx={{ p: 3 }}>
					<Stack direction="row" alignItems="center" justifyContent="space-between">
						<Skeleton variant="circular" sx={{ width: 40, height: 40 }} />
						<Skeleton sx={{ width: 24, height: 12 }} />
					</Stack>

					<Skeleton sx={{ width: 1, height: 10 }} />
					<Skeleton sx={{ width: 'calc(100% - 40px)', height: 10 }} />
					<Skeleton sx={{ width: 'calc(100% - 80px)', height: 10 }} />
				</Stack>
			</Stack>
		);
	}

	return (
		<Stack
			component={Paper}
			variant="outlined"
			sx={{
				borderRadius: 2,
				...sx,
			}}
			{...other}
		>
			<Stack sx={{ p: 1 }}>
				<Skeleton sx={{ paddingTop: '100%' }} />
			</Stack>

			<Stack spacing={2} direction="row" alignItems="center" sx={{ p: 3, pt: 2 }}>
				<Skeleton variant="circular" sx={{ width: 40, height: 40, flexShrink: 0 }} />
				<Stack flexGrow={1} spacing={1}>
					<Skeleton sx={{ height: 10 }} />
					<Skeleton sx={{ width: 0.5, height: 10 }} />
				</Stack>
			</Stack>
		</Stack>
	);
};

export default PostItemSkeleton;
