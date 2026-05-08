import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import { useLocation } from 'react-router';

import { DashboardContent } from '#app/layouts/dashboard/content.tsx';

export const TenantUserDetailsPageSkeleton = () => {
	const location = useLocation();
	// The layout query resolves before child tabs render, so infer the active
	// tab from the URL to avoid showing the General placeholder on Organizations.
	const isOrganizationsTab = location.pathname.endsWith('/organizations');

	return (
		<DashboardContent
			compact
			maxWidth="lg"
			sx={{
				flexGrow: 1,
				minHeight: 0,
				display: 'flex',
				flexDirection: 'column',
			}}
		>
			<Box sx={{ display: { xs: 'block', md: 'none' }, mb: 2 }}>
				<Skeleton variant="rounded" width="100%" height={40} />
			</Box>

			<Box
				sx={{
					flexGrow: 1,
					minHeight: 0,
					display: 'flex',
					gap: 4,
					flexDirection: { xs: 'column', md: 'row' },
				}}
			>
				<Box sx={{ display: { xs: 'none', md: 'block' }, width: 200 }}>
					<Stack spacing={0.75}>
						<TenantUserDetailsNavItemSkeleton width="72%" active />
						<TenantUserDetailsNavItemSkeleton width="58%" />
					</Stack>
				</Box>

				<Box
					sx={{
						flex: 1,
						minWidth: 0,
						minHeight: 0,
						display: 'flex',
						flexDirection: 'column',
					}}
				>
					<TenantUserDetailsHeaderSkeleton withAction={isOrganizationsTab} />

					{isOrganizationsTab ? (
						<TenantUserOrganizationsSkeleton />
					) : (
						<TenantUserGeneralSkeleton />
					)}
				</Box>
			</Box>
		</DashboardContent>
	);
};

const TenantUserDetailsNavItemSkeleton = ({
	width,
	active = false,
}: {
	width: string;
	active?: boolean;
}) => (
	<Box
		sx={{
			px: 1.25,
			py: 1,
			borderRadius: 1,
			bgcolor: active ? 'action.hover' : 'transparent',
		}}
	>
		<Skeleton variant="rounded" width={width} height={16} />
	</Box>
);

const TenantUserDetailsHeaderSkeleton = ({
	withAction = false,
}: {
	withAction?: boolean;
}) => (
	<Box
		sx={{
			mb: { xs: 3, md: 5 },
			display: 'flex',
			alignItems: { xs: 'flex-start', sm: 'center' },
			justifyContent: 'space-between',
			gap: 2,
			flexDirection: { xs: 'column', sm: 'row' },
		}}
	>
		<Box sx={{ minWidth: 0, width: 1 }}>
			<Skeleton variant="text" width="38%" height={38} />
			<Skeleton variant="text" width="30%" height={18} />
		</Box>

		{withAction ? (
			<Skeleton
				variant="rounded"
				width={152}
				height={36}
				sx={{ flexShrink: 0 }}
			/>
		) : null}
	</Box>
);

const TenantUserGeneralSkeleton = () => (
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
			<Card
				sx={{
					pt: 8,
					pb: 5,
					px: 3,
					minWidth: 0,
					height: 'fit-content',
					overflow: 'hidden',
				}}
			>
				<Box sx={{ textAlign: 'center' }}>
					<Skeleton
						variant="circular"
						width={120}
						height={120}
						sx={{ mx: 'auto', mb: 3 }}
					/>
					<Skeleton
						variant="text"
						width={170}
						height={20}
						sx={{ mx: 'auto' }}
					/>
					<Skeleton
						variant="text"
						width={124}
						height={18}
						sx={{ mx: 'auto', mb: 3 }}
					/>
					<Skeleton
						variant="rounded"
						width={76}
						height={28}
						sx={{ mx: 'auto', borderRadius: 999 }}
					/>
				</Box>
			</Card>

			<Stack spacing={3} sx={{ minWidth: 0 }}>
				<Card sx={{ p: 3, minWidth: 0, overflow: 'hidden' }}>
					<Skeleton variant="text" width="34%" height={32} sx={{ mb: 3 }} />
					<Box sx={{ display: 'grid', rowGap: 3, columnGap: 2 }}>
						{['lastName', 'firstName'].map((key) => (
							<Box key={key} sx={{ display: 'grid', rowGap: 1 }}>
								<Skeleton variant="text" width="24%" height={18} />
								<Skeleton
									variant="rounded"
									width="100%"
									height={40}
									sx={{ borderRadius: 1 }}
								/>
							</Box>
						))}
					</Box>
					<Stack sx={{ mt: 3, alignItems: 'flex-end' }}>
						<Skeleton variant="rounded" width={140} height={40} />
					</Stack>
				</Card>

				<Card sx={{ p: 3, minWidth: 0, overflow: 'hidden' }}>
					<Skeleton variant="text" width="24%" height={28} sx={{ mb: 2 }} />
					<Box
						sx={{
							display: 'grid',
							gap: 2,
							gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
						}}
					>
						{['email', 'companies', 'createdAt', 'updatedAt'].map((key) => (
							<Box
								key={key}
								sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}
							>
								<Skeleton variant="circular" width={20} height={20} />
								<Box sx={{ flexGrow: 1, minWidth: 0 }}>
									<Skeleton variant="text" width="38%" height={16} />
									<Skeleton variant="text" width="68%" height={20} />
								</Box>
							</Box>
						))}
					</Box>
				</Card>

				<Card sx={{ p: 3, minWidth: 0, overflow: 'hidden' }}>
					<Skeleton variant="text" width="22%" height={28} />
					<Skeleton variant="text" width="72%" height={20} sx={{ mb: 3 }} />
					<Stack direction="row" spacing={2}>
						<Skeleton variant="rounded" width={86} height={36} />
						<Skeleton variant="rounded" width={112} height={36} />
					</Stack>
				</Card>
			</Stack>
		</Box>
	</Box>
);

const TenantUserOrganizationsSkeleton = () => (
	<Box
		sx={{
			flexGrow: 1,
			minHeight: 0,
			display: 'flex',
			flexDirection: 'column',
		}}
	>
		<Box
			sx={{
				display: 'flex',
				alignItems: { xs: 'stretch', sm: 'center' },
				justifyContent: 'space-between',
				gap: 2,
				flexDirection: { xs: 'column', sm: 'row' },
				mb: 2,
			}}
		>
			<Skeleton variant="rounded" width={260} height={40} />
			<Skeleton variant="rounded" width={126} height={36} />
		</Box>

		<Box
			sx={{
				flexGrow: 1,
				minHeight: 360,
				borderTop: (theme) => `solid 1px ${theme.vars.palette.divider}`,
			}}
		>
			<Stack spacing={1.25} sx={{ pt: 1.25 }}>
				<Skeleton variant="rounded" width="100%" height={40} />
				{['row-1', 'row-2', 'row-3', 'row-4', 'row-5', 'row-6'].map((key) => (
					<Box
						key={key}
						sx={{
							display: 'grid',
							alignItems: 'center',
							gap: 2,
							gridTemplateColumns: {
								xs: 'minmax(0, 1fr) 64px',
								md: 'minmax(0, 1fr) 104px 104px 64px',
							},
						}}
					>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
							<Skeleton variant="circular" width={40} height={40} />
							<Box sx={{ flex: 1, minWidth: 0 }}>
								<Skeleton variant="text" width="54%" height={18} />
								<Skeleton variant="text" width="38%" height={16} />
							</Box>
						</Box>
						<Skeleton
							variant="rounded"
							width={54}
							height={24}
							sx={{ display: { xs: 'none', md: 'block' } }}
						/>
						<Skeleton
							variant="rounded"
							width={68}
							height={24}
							sx={{ display: { xs: 'none', md: 'block' } }}
						/>
						<Skeleton
							variant="circular"
							width={28}
							height={28}
							sx={{ justifySelf: 'end' }}
						/>
					</Box>
				))}
			</Stack>
		</Box>
	</Box>
);
