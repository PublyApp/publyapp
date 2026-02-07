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
import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';

import { Iconify } from '@/front/components/iconify/iconify';
import { Label } from '@/front/components/label/label';
import { SplashScreen } from '@/front/components/loading-screen/splash-screen';
import QueryDisplay from '@/front/components/query-display';
import { useTranslate } from '@/front/hooks/use-translate';
import { ColorSchemePopover } from '@/front/layouts/components/colorscheme-popover';
import { LanguagePopover } from '@/front/layouts/components/language-popover';
import { SimpleLayout } from '@/front/layouts/simple/layout';
import { logout } from '@/front/lib/cookies';
import {
	getTenantHintForUser,
	readLegacyTenantFromBrowser,
	readTenantHintsFromBrowser,
} from '@/front/lib/cookies/tenant-hint-cookie.utils';
import { allLangs } from '@/front/lib/locales/all-langs';
import {
	useGetRedirectCode,
	useGetUserAuthData,
	useGetUserTenantsForPicker,
} from '@/front/lib/react-query/features/common/auth.hooks';
import type { TenantForPickerItem } from '@/js-client/src/models';
import { FRONT_PATH_NAMES, REDIRECT_CODE } from '@/shared/lib/constants';

const RedirectToUnauthorized = () => {
	const navigate = useNavigate();

	useEffect(() => {
		navigate(FRONT_PATH_NAMES.unauthorized, { replace: true });
	}, [navigate]);

	return <SplashScreen />;
};

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

/**
 * Tenant picker UI shown when user has multiple tenants and no valid hint.
 * Shows all tenants including suspended ones, with suspended tenants disabled.
 */
const TenantPicker = () => {
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

const RedirectHandler = ({
	data,
}: {
	data: { redirectCode?: string | null };
}) => {
	const navigate = useNavigate();
	const redirectCode = data.redirectCode;

	// Handle tenant-picker case - render picker UI instead of redirecting
	const showTenantPicker = redirectCode === REDIRECT_CODE.TENANT_PICKER;

	useEffect(() => {
		// Don't redirect if showing tenant picker
		if (showTenantPicker) return;

		if (!redirectCode || redirectCode === REDIRECT_CODE.UNAUTHORIZED) {
			navigate(FRONT_PATH_NAMES.unauthorized, { replace: true });
		} else if (redirectCode === REDIRECT_CODE.STAFF) {
			navigate(FRONT_PATH_NAMES.staff.root, { replace: true });
		} else {
			// redirectCode is a tenant ID
			navigate(FRONT_PATH_NAMES.tenant(redirectCode).root, { replace: true });
		}
	}, [redirectCode, navigate, showTenantPicker]);

	if (showTenantPicker) {
		return <TenantPicker />;
	}

	return <SplashScreen />;
};

const TenantPortalPage = () => {
	// Get current user ID for identity-scoped cookie lookup
	const { data: userAuthData } = useGetUserAuthData();
	const userId = userAuthData?.id;

	// Check for last used tenant from identity-scoped cookie (with legacy fallback)
	const tenantHint = useMemo(() => {
		if (!userId) return undefined;

		// Try new identity-scoped mapping first
		const hintsMap = readTenantHintsFromBrowser();
		const hint = getTenantHintForUser(hintsMap, userId);
		if (hint) return hint;

		// Fall back to legacy cookie for migration period
		return readLegacyTenantFromBrowser();
	}, [userId]);

	// Pass hint to API - it will validate access and return it if valid,
	// or fallback to another tenant if the user no longer has access
	const query = useGetRedirectCode({
		variables: { tenantId: tenantHint },
	});

	return (
		<QueryDisplay
			query={query}
			LoadingSlot={SplashScreen}
			ErrorSlot={RedirectToUnauthorized}
		>
			{({ data }) => <RedirectHandler data={data} />}
		</QueryDisplay>
	);
};

export default TenantPortalPage;
