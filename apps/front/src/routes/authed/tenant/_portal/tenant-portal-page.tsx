import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';

import { Iconify } from '@/front/components/iconify/iconify';
import { SplashScreen } from '@/front/components/loading-screen/splash-screen';
import QueryDisplay from '@/front/components/query-display';
import {
	getTenantHintForUser,
	readLegacyTenantFromBrowser,
	readTenantHintsFromBrowser,
} from '@/front/lib/cookies/tenant-hint-cookie.utils';
import {
	useGetRedirectCode,
	useGetUserAuthData,
	useGetUserTenants,
} from '@/front/lib/react-query/features/common/auth.hooks';
import { useTranslate } from '@/front/hooks/use-translate';
import { FRONT_PATH_NAMES, REDIRECT_CODE } from '@/shared/lib/constants';

const RedirectToUnauthorized = () => {
	const navigate = useNavigate();

	useEffect(() => {
		navigate(FRONT_PATH_NAMES.unauthorized, { replace: true });
	}, [navigate]);

	return <SplashScreen />;
};

/**
 * Tenant picker UI shown when user has multiple tenants and no valid hint.
 */
const TenantPicker = () => {
	const { t } = useTranslate();
	const navigate = useNavigate();
	const tenantsQuery = useGetUserTenants({});

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
					<Grid container spacing={2}>
						{data.tenants?.map((tenant) => (
							<Grid size={{ xs: 12 }} key={tenant.id}>
								<Card variant="outlined">
									<CardActionArea
										onClick={() => tenant.id && handleSelectTenant(tenant.id)}
									>
										<CardContent
											sx={{ display: 'flex', alignItems: 'center', gap: 2 }}
										>
											{tenant.logoUrl ? (
												<Avatar
													src={tenant.logoUrl}
													alt={tenant.name ?? ''}
													sx={{ width: 48, height: 48 }}
												/>
											) : (
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
											)}
											<Box sx={{ flex: 1 }}>
												<Typography variant="subtitle1">
													{tenant.name}
												</Typography>
												{tenant.code && (
													<Typography variant="caption" color="text.secondary">
														{tenant.code}
													</Typography>
												)}
											</Box>
											<Iconify
												icon="eva:arrow-ios-forward-fill"
												width={20}
												sx={{ color: 'text.disabled' }}
											/>
										</CardContent>
									</CardActionArea>
								</Card>
							</Grid>
						))}
					</Grid>
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
