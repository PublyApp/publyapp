import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { varAlpha } from 'minimal-shared/utils';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { IconifyName } from '#app/components/iconify/register-icons.ts';
import { RouterLink } from '#app/components/router-link.tsx';

// ----------------------------------------------------------------------

type PopularDestination = {
	id: string;
	label: string;
	href: string;
	icon: IconifyName;
};

const POPULAR_DESTINATIONS: PopularDestination[] = [
	{
		id: 'pricing',
		label: 'Pricing',
		href: FRONT_PATH_NAMES.marketing.pricing,
		icon: 'ph:tag-bold',
	},
	{
		id: 'about',
		label: 'About',
		href: FRONT_PATH_NAMES.marketing.about,
		icon: 'ph:users-three-bold',
	},
	{
		id: 'contact',
		label: 'Contact',
		href: FRONT_PATH_NAMES.marketing.contact,
		icon: 'ph:envelope-bold',
	},
	{
		id: 'security',
		label: 'Trust & Security',
		href: FRONT_PATH_NAMES.marketing.security,
		icon: 'ph:shield-check-bold',
	},
	{
		id: 'login',
		label: 'Log in',
		href: FRONT_PATH_NAMES.auth.login,
		icon: 'ph:sign-in-bold',
	},
	{
		id: 'signup',
		label: 'Sign up',
		href: FRONT_PATH_NAMES.auth.signup,
		icon: 'ph:user-plus-bold',
	},
];

// ----------------------------------------------------------------------

const MarketingNotFoundPage = () => {
	return (
		<Box
			component="section"
			sx={{
				position: 'relative',
				pt: { xs: 8, md: 14 },
				pb: { xs: 10, md: 16 },
				overflow: 'hidden',
			}}
		>
			{/* Ambient watermark glows behind everything (subtle) */}
			<Box
				aria-hidden="true"
				sx={{
					position: 'absolute',
					inset: 0,
					pointerEvents: 'none',
					background:
						'radial-gradient(circle at 15% 20%, rgba(249,115,22,0.08), transparent 45%), ' +
						'radial-gradient(circle at 85% 30%, rgba(168,85,247,0.08), transparent 45%), ' +
						'radial-gradient(circle at 50% 90%, rgba(20,184,166,0.08), transparent 50%)',
				}}
			/>

			<Container maxWidth="md" sx={{ position: 'relative' }}>
				{/* Hero: 404 in gradient text + glass card overlapping the bottom */}
				<Box
					sx={{
						textAlign: 'center',
						pt: { xs: 4, md: 8 },
						pb: { xs: 4, md: 8 },
					}}
				>
					{/* The 404 gradient text */}
					<Typography
						component="div"
						aria-hidden="true"
						sx={{
							fontSize: { xs: 140, sm: 180, md: 240, lg: 280 },
							fontWeight: 900,
							lineHeight: 1,
							letterSpacing: '-0.04em',
							background:
								'linear-gradient(135deg, #F97316 0%, #A855F7 50%, #14B8A6 100%)',
							WebkitBackgroundClip: 'text',
							WebkitTextFillColor: 'transparent',
							backgroundClip: 'text',
							userSelect: 'none',
						}}
					>
						404
					</Typography>

					{/* Glass card overlapping the bottom of the 404 */}
					<Box
						sx={(theme) => ({
							mt: { xs: -3, sm: -5, md: -8 },
							display: 'inline-block',
							maxWidth: 560,
							px: { xs: 3, md: 4 },
							py: { xs: 3, md: 4 },
							borderRadius: '24px',
							bgcolor: varAlpha(
								theme.vars.palette.background.paperChannel,
								0.7,
							),
							backdropFilter: 'blur(24px)',
							border: '1px solid',
							borderColor: 'divider',
							boxShadow: '0 24px 48px -20px rgba(17,24,39,0.10)',
							position: 'relative',
							zIndex: 1,
						})}
					>
						<Typography
							component="h1"
							sx={{
								fontSize: { xs: 24, md: 32 },
								fontWeight: 700,
								color: 'text.primary',
								mb: 1.5,
								letterSpacing: '-0.01em',
								lineHeight: 1.2,
							}}
						>
							This post got deleted by the algorithm
						</Typography>
						<Typography
							sx={{
								fontSize: { xs: 14, md: 16 },
								color: 'text.secondary',
								lineHeight: 1.6,
							}}
						>
							Or maybe the link is broken. Either way — let's get you back on
							track.
						</Typography>
					</Box>
				</Box>

				{/* Popular destinations as inline pills (canvas-faithful) */}
				<Stack spacing={3} sx={{ mt: { xs: 6, md: 10 }, alignItems: 'center' }}>
					<Typography
						sx={{
							fontSize: 11,
							fontWeight: 700,
							textTransform: 'uppercase',
							letterSpacing: '0.18em',
							color: 'text.secondary',
						}}
					>
						Popular Destinations
					</Typography>
					<Box
						sx={{
							display: 'flex',
							flexWrap: 'wrap',
							justifyContent: 'center',
							gap: 1.5,
						}}
					>
						{POPULAR_DESTINATIONS.map((dest) => {
							return (
								<Box
									key={dest.id}
									component={RouterLink}
									href={dest.href}
									sx={(theme) => ({
										display: 'inline-flex',
										alignItems: 'center',
										gap: 1,
										px: 2.5,
										py: 1.25,
										borderRadius: 999,
										bgcolor: 'background.paper',
										border: '1px solid',
										borderColor: 'divider',
										color: 'text.primary',
										fontSize: 14,
										fontWeight: 500,
										textDecoration: 'none',
										transition:
											'transform 240ms ease, box-shadow 240ms ease, border-color 240ms ease, color 240ms ease',
										'& .dest-icon': {
											color: 'text.secondary',
											transition: 'color 240ms ease',
										},
										'& .dest-arrow': {
											opacity: 0,
											transform: 'translateX(-4px)',
											transition: 'opacity 240ms ease, transform 240ms ease',
										},
										'&:hover': {
											transform: 'translateY(-2px)',
											boxShadow: '0 12px 24px -12px rgba(17,24,39,0.12)',
											borderColor: varAlpha(
												theme.vars.palette.primary.mainChannel,
												0.3,
											),
											color: 'primary.main',
											'& .dest-icon': { color: 'primary.main' },
											'& .dest-arrow': {
												opacity: 1,
												transform: 'translateX(0)',
											},
										},
									})}
								>
									<Iconify icon={dest.icon} width={16} className="dest-icon" />
									<span>{dest.label}</span>
									<Iconify
										icon="ph:arrow-right-bold"
										width={12}
										className="dest-arrow"
									/>
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
