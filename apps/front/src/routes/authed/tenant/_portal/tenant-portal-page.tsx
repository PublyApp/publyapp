import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';

import { Iconify } from '@/front/components/iconify/iconify';
import { Label } from '@/front/components/label/label';
import { SplashScreen } from '@/front/components/loading-screen/splash-screen';
import QueryDisplay from '@/front/components/query-display';
import { useTranslate } from '@/front/hooks/use-translate';
import {
	getTenantHintForUser,
	readLegacyTenantFromBrowser,
	readTenantHintsFromBrowser,
} from '@/front/lib/cookies/tenant-hint-cookie.utils';
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
				opacity: isDisabled ? 0.5 : 1,
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
						sx={{ color: isDisabled ? 'text.disabled' : 'text.primary' }}
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
					<Typography variant="caption" color="text.secondary">
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
					cursor: 'not-allowed',
					bgcolor: 'action.disabledBackground',
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

	return (
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
					<Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
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
						{/* TODO: Replace support@example.com with env.VITE_SUPPORT_EMAIL */}
						{data.hasSuspendedTenants && (
							<Alert
								severity="warning"
								sx={{ mb: 3 }}
								action={
									<Button
										color="inherit"
										size="small"
										href="mailto:support@example.com"
									>
										{t('contact-support')}
									</Button>
								}
							>
								{t('suspended-tenants-banner')}
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
		</Container>
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
