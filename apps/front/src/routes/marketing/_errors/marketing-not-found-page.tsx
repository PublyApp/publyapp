import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { IconifyName } from '#app/components/iconify/register-icons.ts';
import { RouterLink } from '#app/components/router-link.tsx';

// ----------------------------------------------------------------------

type PopularDestination = {
	id: string;
	label: string;
	description: string;
	href: string;
	icon: IconifyName;
};

const POPULAR_DESTINATIONS: PopularDestination[] = [
	{
		id: 'pricing',
		label: 'Pricing',
		description: 'Plans that scale with your team',
		href: FRONT_PATH_NAMES.marketing.pricing,
		icon: 'ph:tag-bold',
	},
	{
		id: 'about',
		label: 'About',
		description: "Who's behind PublyApp",
		href: FRONT_PATH_NAMES.marketing.about,
		icon: 'ph:users-three-bold',
	},
	{
		id: 'contact',
		label: 'Contact',
		description: 'Get in touch with the team',
		href: FRONT_PATH_NAMES.marketing.contact,
		icon: 'ph:envelope-bold',
	},
	{
		id: 'security',
		label: 'Trust & Security',
		description: 'How we protect your data',
		href: FRONT_PATH_NAMES.marketing.security,
		icon: 'ph:shield-check-bold',
	},
	{
		id: 'login',
		label: 'Log in',
		description: 'Already a member',
		href: FRONT_PATH_NAMES.auth.login,
		icon: 'ph:sign-in-bold',
	},
	{
		id: 'signup',
		label: 'Sign up',
		description: 'Start your free trial',
		href: FRONT_PATH_NAMES.auth.signup,
		icon: 'ph:user-plus-bold',
	},
];

// ----------------------------------------------------------------------

const MarketingNotFoundPage = () => {
	return (
		<Box
			component="section"
			sx={{ pt: { xs: 8, md: 14 }, pb: { xs: 10, md: 16 } }}
		>
			<Container maxWidth="md">
				{/* Hero block with gradient watermark behind */}
				<Box
					sx={{
						position: 'relative',
						textAlign: 'center',
						py: { xs: 6, md: 10 },
					}}
				>
					{/* Decorative radial gradient — multi-color watermark behind the 404 */}
					<Box
						aria-hidden="true"
						sx={{
							position: 'absolute',
							inset: 0,
							pointerEvents: 'none',
							background:
								'radial-gradient(circle at 30% 40%, rgba(249,115,22,0.12), transparent 50%), ' +
								'radial-gradient(circle at 70% 60%, rgba(168,85,247,0.12), transparent 50%), ' +
								'radial-gradient(circle at 50% 80%, rgba(20,184,166,0.10), transparent 50%)',
						}}
					/>

					<Box sx={{ position: 'relative', zIndex: 1 }}>
						<Typography
							component="div"
							sx={{
								fontSize: { xs: 120, md: 200 },
								fontWeight: 900,
								lineHeight: 1,
								letterSpacing: '-0.04em',
								color: 'text.primary',
								mb: { xs: 2, md: 4 },
							}}
						>
							404
						</Typography>
						<Typography
							component="h1"
							sx={{
								fontSize: { xs: 28, md: 36 },
								fontWeight: 700,
								color: 'text.primary',
								mb: 2,
								letterSpacing: '-0.01em',
							}}
						>
							This post got deleted by the algorithm
						</Typography>
						<Typography
							sx={{
								fontSize: 16,
								color: 'text.secondary',
								maxWidth: 520,
								mx: 'auto',
								mb: 4,
								lineHeight: 1.6,
							}}
						>
							Or maybe the link is broken. Either way — let's get you back on
							track.
						</Typography>
						<Box
							component={RouterLink}
							href={FRONT_PATH_NAMES.home}
							sx={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: 1,
								py: 1.5,
								px: 3,
								borderRadius: 2,
								fontWeight: 700,
								fontSize: 15,
								textDecoration: 'none',
								cursor: 'pointer',
								bgcolor: 'primary.main',
								color: 'common.white',
								transition: 'transform 240ms ease, box-shadow 240ms ease',
								'&:hover': {
									transform: 'translateY(-2px)',
									boxShadow: '0 12px 24px -8px rgba(17,24,39,0.20)',
								},
							}}
						>
							<Iconify icon="ph:arrow-left-bold" width={16} />
							Back to home
						</Box>
					</Box>
				</Box>

				{/* Popular destinations */}
				<Stack spacing={3} sx={{ mt: { xs: 6, md: 10 } }}>
					<Typography
						sx={{
							fontSize: 12,
							fontWeight: 700,
							textTransform: 'uppercase',
							letterSpacing: '0.12em',
							color: 'text.secondary',
							textAlign: 'center',
						}}
					>
						Popular destinations
					</Typography>
					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: {
								xs: '1fr',
								sm: 'repeat(2, 1fr)',
								md: 'repeat(3, 1fr)',
							},
							gap: 2,
						}}
					>
						{POPULAR_DESTINATIONS.map((dest) => {
							return (
								<Box
									key={dest.id}
									component={RouterLink}
									href={dest.href}
									sx={{
										display: 'flex',
										gap: 2,
										p: 2.5,
										borderRadius: '12px',
										bgcolor: 'background.paper',
										border: '1px solid',
										borderColor: 'divider',
										textDecoration: 'none',
										transition: 'transform 240ms ease, box-shadow 240ms ease',
										'&:hover': {
											transform: 'translateY(-2px)',
											boxShadow: '0 12px 24px -12px rgba(17,24,39,0.12)',
										},
									}}
								>
									<Box
										sx={{
											width: 36,
											height: 36,
											borderRadius: '10px',
											flexShrink: 0,
											display: 'inline-flex',
											alignItems: 'center',
											justifyContent: 'center',
											bgcolor: 'primary.lighter',
											color: 'primary.main',
										}}
									>
										<Iconify icon={dest.icon} width={18} />
									</Box>
									<Box>
										<Typography
											sx={{
												fontSize: 14,
												fontWeight: 700,
												color: 'text.primary',
											}}
										>
											{dest.label}
										</Typography>
										<Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
											{dest.description}
										</Typography>
									</Box>
								</Box>
							);
						})}
					</Box>
				</Stack>
			</Container>
		</Box>
	);
};

export default MarketingNotFoundPage;
