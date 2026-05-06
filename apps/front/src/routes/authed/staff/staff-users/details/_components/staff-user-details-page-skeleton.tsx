import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Divider from '@mui/material/Divider';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';

import { DashboardContent } from '#app/layouts/dashboard/content.tsx';

export const StaffUserDetailsPageSkeleton = () => {
	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
			compact
			maxWidth="md"
		>
			{/* Skeleton mirrors the actual page layout (breadcrumbs + sidebar + content cards). */}
			<Box sx={{ mb: { xs: 3, md: 5 } }}>
				<Skeleton variant="text" width="38%" height={44} />
				<Skeleton variant="text" width="52%" height={22} />
			</Box>

			<Box sx={{ containerType: 'inline-size' }}>
				<Box
					sx={{
						display: 'grid',
						gap: 3,
						// Avoid stretching the left sidebar card to match the right column height.
						alignItems: 'start',
						gridTemplateColumns: '1fr',
						'@container (min-width: 837px)': {
							gridTemplateColumns: '1fr 2fr',
						},
					}}
				>
					<Card sx={{ pt: 8, pb: 5, px: 3, height: 'fit-content' }}>
						<Box sx={{ textAlign: 'center' }}>
							<Skeleton
								variant="circular"
								width={120}
								height={120}
								sx={{ mx: 'auto', mb: 2 }}
							/>
							<Skeleton
								variant="rounded"
								width={160}
								height={36}
								sx={{ mx: 'auto', borderRadius: 1, mb: 2 }}
							/>
							<Skeleton
								variant="rounded"
								width={96}
								height={28}
								sx={{ mx: 'auto', borderRadius: 999 }}
							/>
						</Box>

						<Divider sx={{ my: 3, borderStyle: 'dashed' }} />

						<Stack spacing={2} sx={{ px: 2 }}>
							{['email', 'level', 'createdAt', 'updatedAt'].map((key) => (
								<Box
									key={key}
									sx={{
										display: 'flex',
										alignItems: 'center',
										gap: 1.5,
									}}
								>
									<Skeleton variant="circular" width={20} height={20} />
									<Box sx={{ flexGrow: 1, minWidth: 0 }}>
										<Skeleton variant="text" width="38%" height={16} />
										<Skeleton variant="text" width="68%" height={20} />
									</Box>
								</Box>
							))}
						</Stack>
					</Card>

					<Stack spacing={3}>
						<Card sx={{ p: 3 }}>
							<Skeleton variant="text" width="42%" height={36} sx={{ mb: 3 }} />
							<Box sx={{ display: 'grid', rowGap: 3, columnGap: 2 }}>
								{['lastName', 'firstName', 'accountLevel'].map((key) => (
									<Box key={key} sx={{ display: 'grid', rowGap: 1 }}>
										<Skeleton variant="text" width="28%" height={20} />
										<Skeleton
											variant="rounded"
											width="100%"
											height={56}
											sx={{ borderRadius: 1 }}
										/>
									</Box>
								))}
							</Box>
							<Stack sx={{ mt: 3, alignItems: 'flex-end' }}>
								<Skeleton variant="rounded" width={140} height={40} />
							</Stack>
						</Card>

						<Card sx={{ p: 3 }}>
							<Skeleton variant="text" width="30%" height={28} sx={{ mb: 2 }} />
							<Stack
								direction="row"
								spacing={1}
								sx={{ flexWrap: 'wrap', rowGap: 1 }}
							>
								<Skeleton variant="rounded" width={92} height={32} />
								<Skeleton variant="rounded" width={110} height={32} />
								<Skeleton variant="rounded" width={84} height={32} />
							</Stack>
							<Skeleton
								variant="rounded"
								width="100%"
								height={56}
								sx={{ mt: 2, borderRadius: 1 }}
							/>
						</Card>

						<Card sx={{ p: 3 }}>
							<Skeleton variant="text" width="24%" height={28} sx={{ mb: 1 }} />
							<Skeleton variant="text" width="78%" height={18} />
							<Skeleton variant="text" width="62%" height={18} sx={{ mb: 3 }} />
							<Stack direction="row" spacing={2}>
								<Skeleton variant="rounded" width={120} height={36} />
								<Skeleton variant="rounded" width={120} height={36} />
							</Stack>
						</Card>
					</Stack>
				</Box>
			</Box>
		</DashboardContent>
	);
};
