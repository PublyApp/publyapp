import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { redirect } from 'react-router';

import { APP_NAME, FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { buildSeoMeta } from '#app/lib/seo/meta.ts';
import { CtaBand } from '#app/routes/marketing/_components/cta-band.tsx';
import { MarketingHero } from '#app/routes/marketing/_components/marketing-hero.tsx';
import { getLatestYear } from '#app/routes/marketing/_data/changelog.tsx';

import type { Route } from './+types/changelog-redirect-route';

// ----------------------------------------------------------------------

// React Router loader — runs BEFORE the route component renders. If we
// have entries, redirect to the latest year (302). Otherwise return null
// so the component can render its empty state. The redirect target uses
// the helper so the URL ends in `/`, matching the marketing trailing-slash
// policy (avoids a wasteful 302→301 chain through the layout loader).
export const loader = () => {
	const latest = getLatestYear();
	if (latest !== null) {
		return redirect(FRONT_PATH_NAMES.marketing.changelogYear(latest));
	}
	return null;
};

// ----------------------------------------------------------------------

// Reached only when the loader returned null (no published entries).
// The page mirrors the shape of the year route's empty state but at
// the top-level (no year context).
const ChangelogRedirectRoute = () => {
	return (
		<>
			<MarketingHero
				eyebrow="Changelog"
				eyebrowIcon="ph:rocket-launch-fill"
				title="What's new in PublyApp"
				subhead="Product updates, fixes, and behind-the-scenes wins. Updated weekly."
			/>

			<Container maxWidth="md" sx={{ pb: { xs: 8, md: 12 } }}>
				<Stack
					alignItems="center"
					spacing={2.5}
					sx={{
						py: { xs: 10, md: 14 },
						textAlign: 'center',
						borderRadius: '20px',
						border: '1px dashed',
						borderColor: 'divider',
						bgcolor: 'background.neutral',
					}}
				>
					<Box
						sx={{
							width: 56,
							height: 56,
							borderRadius: '50%',
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							bgcolor: 'background.paper',
							color: 'text.secondary',
							border: '1px solid',
							borderColor: 'divider',
						}}
					>
						<Iconify icon="ph:rocket-launch-fill" width={24} />
					</Box>
					<Typography
						sx={{ fontSize: 18, fontWeight: 700, color: 'text.primary' }}
					>
						No releases yet
					</Typography>
					<Typography
						sx={{ fontSize: 14, color: 'text.secondary', maxWidth: 420 }}
					>
						We're still warming up the press. New releases will land here soon —
						come back in a week.
					</Typography>
					<Box
						component={RouterLink}
						href="/"
						sx={{
							mt: 1,
							display: 'inline-flex',
							alignItems: 'center',
							gap: 0.75,
							color: 'primary.main',
							fontSize: 14,
							fontWeight: 600,
							textDecoration: 'none',
							'&:hover': { textDecoration: 'underline' },
						}}
					>
						Back to home
						<Iconify icon="ph:arrow-right-bold" width={14} />
					</Box>
				</Stack>
			</Container>

			<CtaBand
				eyebrowLabel="Start scaling today"
				title={'Start using the latest\nfeatures today'}
				subhead="Join thousands of teams turning their followers into active brand advocates."
				ctaLabel="Start for Free"
				ctaHref={FRONT_PATH_NAMES.auth.signup}
				microcopy="14-day free trial. No credit card required."
			/>
		</>
	);
};

export default ChangelogRedirectRoute;

// ----------------------------------------------------------------------

export const meta = ({ location }: Route.MetaArgs) => {
	return buildSeoMeta({
		title: `Changelog | ${APP_NAME}`,
		description: 'Product updates, fixes, and behind-the-scenes wins.',
		pathname: location.pathname,
	});
};
