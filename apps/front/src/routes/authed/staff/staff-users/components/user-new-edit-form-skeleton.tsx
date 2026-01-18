import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';

export const UserNewEditFormSkeleton = () => {
	return (
		<Grid container spacing={3}>
			{/* Left side - Avatar upload card */}
			<Grid size={{ xs: 12, md: 4 }}>
				<Card sx={{ pt: 10, pb: 5, px: 3 }}>
					<Box
						sx={{
							mb: 5,
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
						}}
					>
						{/* Avatar skeleton */}
						<Skeleton
							variant="circular"
							width={120}
							height={120}
							sx={{ mb: 2 }}
						/>

						{/* Upload button skeleton */}
						<Skeleton
							variant="rectangular"
							width={140}
							height={36}
							sx={{ borderRadius: 1, mb: 2 }}
						/>

						{/* Helper text skeleton */}
						<Stack spacing={0.5} sx={{ width: '100%', alignItems: 'center' }}>
							<Skeleton variant="text" width="80%" height={16} />
							<Skeleton variant="text" width="60%" height={16} />
						</Stack>
					</Box>
				</Card>
			</Grid>

			{/* Right side - Form fields card */}
			<Grid size={{ xs: 12, md: 8 }}>
				<Card sx={{ p: 3 }}>
					<Box
						sx={{
							rowGap: 3,
							columnGap: 2,
							display: 'grid',
							gridTemplateColumns: {
								xs: 'repeat(1, 1fr)',
								sm: 'repeat(2, 1fr)',
							},
						}}
					>
						{/* Form field skeletons */}
						{['lastName', 'firstName', 'email', 'role'].map((fieldName) => (
							<Box
								key={`form-field-skeleton-${fieldName}`}
								sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
							>
								<Skeleton variant="text" width="30%" height={20} />
								<Skeleton
									variant="rectangular"
									width="100%"
									height={56}
									sx={{ borderRadius: 1 }}
								/>
							</Box>
						))}
					</Box>

					{/* Submit button skeleton */}
					<Stack sx={{ mt: 3, alignItems: 'flex-end' }}>
						<Skeleton
							variant="rectangular"
							width={120}
							height={40}
							sx={{ borderRadius: 1 }}
						/>
					</Stack>
				</Card>
			</Grid>
		</Grid>
	);
};
