import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';
import { useEffect } from 'react';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { varFade } from '#app/components/animate/variants/fade.ts';
import { RouterLink } from '#app/components/router-link.tsx';

import { registerCookieConsentWindowApi } from './consent-window-api';
import { CookiePreferencesDialog } from './cookie-preferences-dialog';
import { useCookieConsent } from './use-cookie-consent';

// ----------------------------------------------------------------------

export const CookieConsentBanner = () => {
	const consent = useCookieConsent();

	// Hydrate from storage + register window API on mount.
	useEffect(() => {
		consent.hydrate();
		registerCookieConsentWindowApi();
	}, []);

	const showBanner = consent.status === 'unknown';

	return (
		<>
			{showBanner && (
				<Box
					component={m.div}
					variants={varFade('inUp', { distance: 24 })}
					initial="initial"
					animate="animate"
					exit="exit"
					role="region"
					aria-label="Cookie consent"
					sx={(theme) => ({
						position: 'fixed',
						bottom: 0,
						left: 0,
						right: 0,
						zIndex: theme.zIndex.snackbar - 1,
						bgcolor: 'background.paper',
						borderTop: '1px solid',
						borderColor: 'divider',
						boxShadow: theme.shadows[8],
					})}
				>
					<Container maxWidth="lg" sx={{ py: { xs: 2, sm: 2.5 } }}>
						<Stack
							direction={{ xs: 'column', md: 'row' }}
							spacing={{ xs: 2, md: 3 }}
							alignItems={{ xs: 'stretch', md: 'center' }}
							justifyContent="space-between"
						>
							<Box sx={{ flex: 1, minWidth: 0 }}>
								<Typography
									variant="subtitle2"
									sx={{ mb: 0.5, fontWeight: 600 }}
								>
									We use cookies
								</Typography>
								<Typography
									variant="body2"
									sx={{ color: 'text.secondary', lineHeight: 1.5 }}
								>
									Essential cookies keep the site working. With your consent, we
									also use analytics and marketing cookies. Read our{' '}
									<RouterLink
										href={FRONT_PATH_NAMES.marketing.cookies}
										style={{ color: 'inherit', textDecoration: 'underline' }}
									>
										Cookie Policy
									</RouterLink>
									.
								</Typography>
							</Box>
							<Stack
								direction={{ xs: 'column', sm: 'row' }}
								spacing={1}
								sx={{ flexShrink: 0 }}
							>
								<Button
									variant="text"
									size="medium"
									onClick={() => {
										consent.openPreferences();
									}}
								>
									Customize
								</Button>
								<Button
									variant="outlined"
									size="medium"
									onClick={() => {
										consent.rejectAll();
									}}
								>
									Reject all
								</Button>
								<Button
									variant="contained"
									size="medium"
									onClick={() => {
										consent.acceptAll();
									}}
								>
									Accept all
								</Button>
							</Stack>
						</Stack>
					</Container>
				</Box>
			)}
			<CookiePreferencesDialog />
		</>
	);
};
