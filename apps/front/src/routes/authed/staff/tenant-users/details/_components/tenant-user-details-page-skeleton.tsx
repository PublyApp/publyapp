import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';

import { DashboardContent } from '#app/layouts/dashboard/content.tsx';

export const TenantUserDetailsPageSkeleton = () => {
	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
			compact
			maxWidth="lg"
		>
			<Box sx={{ mb: { xs: 3, md: 5 } }}>
				<Skeleton variant="text" width="38%" height={44} />
				<Skeleton variant="text" width="52%" height={22} />
			</Box>

			<Stack
				spacing={3}
				sx={{
					flexGrow: 1,
					minHeight: 0,
					display: 'flex',
					flexDirection: 'column',
				}}
			>
				<Box sx={{ containerType: 'inline-size' }}>
					<Box
						sx={{
							display: 'grid',
							gap: 3,
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
						</Card>

						<Stack spacing={3}>
							<Card sx={{ p: 3 }}>
								<Skeleton
									variant="text"
									width="42%"
									height={36}
									sx={{ mb: 3 }}
								/>
								<Box sx={{ display: 'grid', rowGap: 3, columnGap: 2 }}>
									{['lastName', 'firstName'].map((key) => (
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
								<Skeleton
									variant="text"
									width="24%"
									height={28}
									sx={{ mb: 2 }}
								/>
								<Box
									sx={{
										display: 'grid',
										gap: 2,
										gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
									}}
								>
									{['email', 'companies', 'createdAt', 'updatedAt'].map(
										(key) => (
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
										),
									)}
								</Box>
							</Card>
						</Stack>
					</Box>
				</Box>

				<Card sx={{ p: 3, flexGrow: 1, minHeight: 0 }}>
					<Skeleton variant="text" width={180} height={32} />
					<Skeleton variant="text" width={260} height={20} sx={{ mb: 3 }} />
					<Stack spacing={1.5}>
						{['row-1', 'row-2', 'row-3'].map((key) => (
							<Skeleton
								key={key}
								variant="rounded"
								width="100%"
								height={56}
								sx={{ borderRadius: 1 }}
							/>
						))}
					</Stack>
				</Card>
			</Stack>
		</DashboardContent>
	);
};
