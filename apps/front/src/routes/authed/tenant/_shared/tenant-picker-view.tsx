import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { useCallback } from 'react';
import { useNavigate } from 'react-router';

import type { TenantForPickerItem } from '@org/client-ts/src/models';
import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { Label } from '#app/components/label/label.tsx';
import { SplashScreen } from '#app/components/loading-screen/splash-screen.tsx';
import QueryDisplay from '#app/components/query-display.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { ColorSchemePopover } from '#app/layouts/components/colorscheme-popover.tsx';
import { LanguagePopover } from '#app/layouts/components/language-popover.tsx';
import { SimpleLayout } from '#app/layouts/simple/layout.tsx';
import { logout } from '#app/lib/cookies/logout.utils.ts';
import { allLangs } from '#app/lib/locales/all-langs.ts';
import { useGetUserTenantsForPicker } from '#app/lib/react-query/features/common/auth.hooks.ts';

// ----------------------------------------------------------------------

type TenantCardProps = {
	tenant: TenantForPickerItem;
	onSelect: (tenantId: string) => void;
};

const TenantCard = ({ tenant, onSelect }: TenantCardProps) => {
	const { t } = useTranslate();
	const isSuspended = tenant.isSuspended ?? false;
	const isDisabled = !tenant.isActive;

	const cardContent = (
		<CardContent
			sx={{
				display: 'flex',
				alignItems: 'center',
				gap: 2,
			}}
		>
			<Box
				sx={{
					width: 48,
					height: 48,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					borderRadius: 1,
					bgcolor: 'background.neutral',
					opacity: isDisabled ? 0.5 : 1,
				}}
			>
				<Iconify
					icon="solar:buildings-bold"
					width={28}
					sx={{ color: 'text.disabled' }}
				/>
			</Box>
			<Box sx={{ flex: 1 }}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
					<Typography
						variant="subtitle1"
						sx={{
							color: isDisabled ? 'text.disabled' : 'text.primary',
						}}
					>
						{tenant.name}
					</Typography>
					{isSuspended && (
						<Label color="error" variant="soft">
							{t('suspended')}
						</Label>
					)}
				</Box>
				{tenant.code && (
					<Typography
						variant="caption"
						color="text.secondary"
						sx={{ opacity: isDisabled ? 0.5 : 1 }}
					>
						{tenant.code}
					</Typography>
				)}
			</Box>
			{!isDisabled && (
				<Iconify
					icon="eva:arrow-ios-forward-fill"
					width={20}
					sx={{ color: 'text.disabled' }}
				/>
			)}
		</CardContent>
	);

	if (isDisabled) {
		return (
			<Card
				variant="outlined"
				sx={{
					cursor: 'default',
					bgcolor: 'transparent',
				}}
			>
				{cardContent}
			</Card>
		);
	}

	return (
		<Card variant="outlined">
			<CardActionArea onClick={() => tenant.id && onSelect(tenant.id)}>
				{cardContent}
			</CardActionArea>
		</Card>
	);
};

// ----------------------------------------------------------------------

/**
 * Reusable tenant picker UI.
 * Shows all tenants including suspended ones, with suspended tenants disabled.
 * Used by both the tenant portal redirect page and the organizations page.
 */
export const TenantPickerView = () => {
	const { t } = useTranslate();
	const navigate = useNavigate();
	const tenantsQuery = useGetUserTenantsForPicker({});

	const handleSelectTenant = (tenantId: string) => {
		navigate(FRONT_PATH_NAMES.tenant(tenantId).root, { replace: true });
	};

	const handleLogout = useCallback(() => {
		logout();
	}, []);

	return (
		<SimpleLayout
			slotProps={{
				header: {
					slots: {
						rightArea: (
							<Box
								sx={{
									display: 'flex',
									alignItems: 'center',
									gap: { xs: 1, sm: 1.5 },
								}}
							>
								<ColorSchemePopover />
								<LanguagePopover data={allLangs} />
							</Box>
						),
					},
				},
			}}
		>
			<Container maxWidth="sm" sx={{ py: 8 }}>
				<Typography variant="h4" sx={{ mb: 1, textAlign: 'center' }}>
					{t('select-organization')}
				</Typography>
				<Typography
					variant="body2"
					color="text.secondary"
					sx={{ mb: 4, textAlign: 'center' }}
				>
					{t('select-organization-description')}
				</Typography>

				<QueryDisplay
					query={tenantsQuery}
					LoadingSlot={() => (
						<Box
							sx={{
								display: 'flex',
								justifyContent: 'center',
								py: 4,
							}}
						>
							<SplashScreen />
						</Box>
					)}
					ErrorSlot={() => (
						<Typography color="error" sx={{ textAlign: 'center' }}>
							{t('failed-to-load-organizations')}
						</Typography>
					)}
					EmptySlot={() => (
						<Typography color="text.secondary" sx={{ textAlign: 'center' }}>
							{t('no-organizations-found')}
						</Typography>
					)}
				>
					{({ data }) => (
						<Box>
							{data.hasSuspendedTenants && (
								<Alert severity="warning" sx={{ mb: 3 }}>
									{t('suspended-tenants-banner')}{' '}
									<Link
										href="mailto:support@example.com"
										color="inherit"
										sx={{ fontWeight: 'bold' }}
									>
										{t('contact-support')}
									</Link>
								</Alert>
							)}
							<Grid container spacing={2}>
								{data.tenants?.map((tenant) => (
									<Grid size={{ xs: 12 }} key={tenant.id}>
										<TenantCard tenant={tenant} onSelect={handleSelectTenant} />
									</Grid>
								))}
							</Grid>
						</Box>
					)}
				</QueryDisplay>

				<Box
					sx={{
						mt: 4,
						display: 'flex',
						justifyContent: 'flex-start',
					}}
				>
					<Button
						variant="text"
						startIcon={
							<Iconify icon="solar:logout-2-bold-duotone" width={18} />
						}
						onClick={handleLogout}
						sx={{
							color: 'text.secondary',
						}}
					>
						{t('log-out')}
					</Button>
				</Box>
			</Container>
		</SimpleLayout>
	);
};
