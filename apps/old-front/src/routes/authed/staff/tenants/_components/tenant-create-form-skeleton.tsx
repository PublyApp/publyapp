import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';

export const TenantCreateOrEditFormSkeleton = () => {
	return (
		<Grid container spacing={3}>
			{/* Logo Upload Section */}
			<Grid size={{ xs: 12, md: 4 }}>
				<Card sx={{ pt: 10, pb: 5, px: 3 }}>
					<Box sx={{ mb: 5 }}>
						{/* Avatar Upload Skeleton */}
						<Box
							sx={{
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
							}}
						>
							<Skeleton
								variant="circular"
								width={120}
								height={120}
								sx={{ mb: 2 }}
							/>
							<Skeleton variant="text" width={200} height={20} />
							<Skeleton variant="text" width={150} height={16} sx={{ mt: 1 }} />
						</Box>
					</Box>
				</Card>
			</Grid>

			{/* Form Fields Section */}
			<Grid size={{ xs: 12, md: 8 }}>
				{/* Basic Info Card */}
				<Card sx={{ p: 3, mb: 5 }}>
					<Box
						sx={{
							rowGap: 3,
							columnGap: 2,
							display: 'grid',
							gridTemplateColumns: {
								xs: 'repeat(1, 1fr)',
								sm: 'repeat(1, 2.5fr 1.5fr)',
							},
							alignItems: 'flex-start',
						}}
					>
						{/* Workspace Name Field */}
						<Box>
							<Skeleton variant="text" width={120} height={20} sx={{ mb: 1 }} />
							<Skeleton
								variant="rectangular"
								height={56}
								sx={{ borderRadius: 1 }}
							/>
						</Box>

						{/* Max Users Field */}
						<Box>
							<Skeleton variant="text" width={100} height={20} sx={{ mb: 1 }} />
							<Skeleton
								variant="rectangular"
								width={120}
								height={56}
								sx={{ borderRadius: 1 }}
							/>
						</Box>
					</Box>

					{/* Submit Button */}
					<Stack sx={{ mt: 3, alignItems: 'flex-end' }}>
						<Skeleton
							variant="rectangular"
							width={140}
							height={40}
							sx={{ borderRadius: 1 }}
						/>
					</Stack>
				</Card>
			</Grid>
		</Grid>
	);
};
