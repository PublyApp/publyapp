import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import { type Breakpoint, styled } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
// import { Iconify } from '#app/components/iconify/index.ts';
// import { Logo } from '#app/components/logo/index.ts';
// import { RouterLink } from '#app/routes/components';
// import { paths } from '#app/routes/paths';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { Logo } from '#app/components/logo/logo.tsx';
import { RouterLink } from '#app/components/router-link.tsx';

// ----------------------------------------------------------------------

const _socials = [
	{
		value: 'facebook',
		label: 'Facebook',
		path: 'https://www.facebook.com/caitlyn.kerluke',
	},
	{
		value: 'instagram',
		label: 'Instagram',
		path: 'https://www.instagram.com/caitlyn.kerluke',
	},
	{
		value: 'linkedin',
		label: 'Linkedin',
		path: 'https://www.linkedin.com/caitlyn.kerluke',
	},
	{
		value: 'twitter',
		label: 'Twitter',
		path: 'https://www.twitter.com/caitlyn.kerluke',
	},
];

const LINKS = [
	{
		headline: 'Minimal',
		children: [
			{ name: 'About us', href: '#' },
			{ name: 'Contact us', href: '#' },
			{ name: 'FAQs', href: '#' },
		],
	},
	{
		headline: 'Legal',
		children: [
			{ name: 'Terms and condition', href: '#' },
			{ name: 'Privacy policy', href: '#' },
		],
	},
	{
		headline: 'Contact',
		children: [{ name: 'support@minimals.cc', href: '#' }],
	},
];

// ----------------------------------------------------------------------

const FooterRoot = styled('footer')(({ theme }) => {
	return {
		position: 'relative',
		backgroundColor: theme.vars.palette.background.default,
	};
});

export type FooterProps = React.ComponentProps<typeof FooterRoot>;

export const Footer = ({
	sx,
	layoutQuery = 'md',
	...other
}: FooterProps & { layoutQuery?: Breakpoint }) => {
	return (
		<FooterRoot sx={sx} {...other}>
			<Divider />

			<Container
				sx={(theme) => {
					return {
						pb: 5,
						pt: 10,
						textAlign: 'center',
						[theme.breakpoints.up(layoutQuery)]: { textAlign: 'unset' },
					};
				}}
			>
				<Logo />

				<Grid
					container
					sx={[
						(theme) => {
							return {
								mt: 3,
								justifyContent: 'center',
								[theme.breakpoints.up(layoutQuery)]: {
									justifyContent: 'space-between',
								},
							};
						},
					]}
				>
					<Grid size={{ xs: 12, [layoutQuery]: 3 }}>
						<Typography
							variant="body2"
							sx={(theme) => {
								return {
									mx: 'auto',
									maxWidth: 280,
									[theme.breakpoints.up(layoutQuery)]: { mx: 'unset' },
								};
							}}
						>
							The starting point for your next project with Minimal UI Kit,
							built on the newest version of Material-UI ©, ready to be
							customized to your style.
						</Typography>

						<Box
							sx={(theme) => {
								return {
									mt: 3,
									mb: 5,
									display: 'flex',
									justifyContent: 'center',
									[theme.breakpoints.up(layoutQuery)]: {
										mb: 0,
										justifyContent: 'flex-start',
									},
								};
							}}
						>
							{_socials.map((social) => {
								return (
									<IconButton key={social.label}>
										{social.value === 'twitter' && (
											<Iconify icon="socials:twitter" />
										)}
										{social.value === 'facebook' && (
											<Iconify icon="socials:facebook" />
										)}
										{social.value === 'instagram' && (
											<Iconify icon="socials:instagram" />
										)}
										{social.value === 'linkedin' && (
											<Iconify icon="socials:linkedin" />
										)}
									</IconButton>
								);
							})}
						</Box>
					</Grid>

					<Grid size={{ xs: 12, [layoutQuery]: 6 }}>
						<Box
							sx={(theme) => {
								return {
									gap: 5,
									display: 'flex',
									flexDirection: 'column',
									[theme.breakpoints.up(layoutQuery)]: { flexDirection: 'row' },
								};
							}}
						>
							{LINKS.map((list) => {
								return (
									<Box
										key={list.headline}
										sx={(theme) => {
											return {
												gap: 2,
												width: 1,
												display: 'flex',
												alignItems: 'center',
												flexDirection: 'column',
												[theme.breakpoints.up(layoutQuery)]: {
													alignItems: 'flex-start',
												},
											};
										}}
									>
										<Typography component="div" variant="overline">
											{list.headline}
										</Typography>

										{list.children.map((link) => {
											return (
												<Link
													key={link.name}
													component={RouterLink}
													href={link.href}
													color="inherit"
													variant="body2"
												>
													{link.name}
												</Link>
											);
										})}
									</Box>
								);
							})}
						</Box>
					</Grid>
				</Grid>

				<Typography variant="body2" sx={{ mt: 10 }}>
					© All rights reserved.
				</Typography>
			</Container>
		</FooterRoot>
	);
};

// ----------------------------------------------------------------------

// ----------------------------------------------------------------------

const HOME_FOOTER_PRODUCT_LINKS = [
	{ label: 'Features', href: '#features' },
	{ label: 'Integrations', href: '#' },
	{ label: 'Pricing', href: '#pricing' },
	{ label: 'Changelog', href: '#' },
];

const HOME_FOOTER_RESOURCE_LINKS = [
	{ label: 'Blog', href: '#' },
	{ label: 'Help Center', href: '#' },
	{ label: 'Community', href: '#' },
	{ label: 'Contact Support', href: '#' },
];

const HOME_FOOTER_SOCIALS: { label: string; icon: string }[] = [
	{ label: 'X', icon: 'ph:x-logo-fill' },
	{ label: 'Instagram', icon: 'ph:instagram-logo-fill' },
	{ label: 'LinkedIn', icon: 'ph:linkedin-logo-fill' },
];

export const HomeFooter = ({ sx, ...other }: FooterProps) => {
	return (
		<FooterRoot
			sx={[
				{
					pt: 10,
					pb: 5,
				},
				...(Array.isArray(sx) ? sx : [sx]),
			]}
			{...other}
		>
			<Container maxWidth="lg">
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' },
						gap: 6,
						mb: 8,
					}}
				>
					<Box sx={{ gridColumn: { md: 'span 2' } }}>
						<Box
							component={RouterLink}
							href="/"
							sx={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: 1,
								mb: 2,
								textDecoration: 'none',
							}}
						>
							<Box
								sx={{
									width: 32,
									height: 32,
									borderRadius: 1.5,
									bgcolor: 'text.primary',
									color: 'background.paper',
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
								}}
							>
								<Iconify icon={'ph:calendar-plus-bold' as never} width={20} />
							</Box>
							<Typography
								sx={{
									fontWeight: 700,
									fontSize: 24,
									letterSpacing: '-0.02em',
									color: 'text.primary',
								}}
							>
								PublyApp
							</Typography>
						</Box>
						<Typography
							sx={{
								fontSize: 14,
								color: 'text.secondary',
								maxWidth: 320,
								mb: 3,
							}}
						>
							The intelligent OS for social media teams. Plan, create, and
							analyze in one unified workspace.
						</Typography>
						<Box sx={{ display: 'flex', gap: 1.5 }}>
							{HOME_FOOTER_SOCIALS.map((social) => {
								return (
									<Box
										key={social.label}
										component="a"
										href="#"
										aria-label={social.label}
										sx={{
											width: 32,
											height: 32,
											borderRadius: '50%',
											bgcolor: 'background.paper',
											border: '1px solid',
											borderColor: 'divider',
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
											color: 'text.secondary',
											textDecoration: 'none',
											transition: 'all 0.3s ease',
											'&:hover': {
												color: 'primary.main',
												borderColor: 'primary.main',
											},
										}}
									>
										<Iconify icon={social.icon as never} width={14} />
									</Box>
								);
							})}
						</Box>
					</Box>

					<Box>
						<Typography
							sx={{
								fontWeight: 700,
								fontSize: 14,
								color: 'text.primary',
								mb: 2,
							}}
						>
							Product
						</Typography>
						<Box
							component="ul"
							sx={{
								listStyle: 'none',
								p: 0,
								m: 0,
								'& > li + li': { mt: 1.5 },
							}}
						>
							{HOME_FOOTER_PRODUCT_LINKS.map((item) => {
								return (
									<Box component="li" key={item.label}>
										<Link
											href={item.href}
											underline="none"
											sx={{
												fontSize: 14,
												color: 'text.secondary',
												transition: 'color 0.3s ease',
												'&:hover': { color: 'primary.main' },
											}}
										>
											{item.label}
										</Link>
									</Box>
								);
							})}
						</Box>
					</Box>

					<Box>
						<Typography
							sx={{
								fontWeight: 700,
								fontSize: 14,
								color: 'text.primary',
								mb: 2,
							}}
						>
							Resources
						</Typography>
						<Box
							component="ul"
							sx={{
								listStyle: 'none',
								p: 0,
								m: 0,
								'& > li + li': { mt: 1.5 },
							}}
						>
							{HOME_FOOTER_RESOURCE_LINKS.map((item) => {
								return (
									<Box component="li" key={item.label}>
										<Link
											href={item.href}
											underline="none"
											sx={{
												fontSize: 14,
												color: 'text.secondary',
												transition: 'color 0.3s ease',
												'&:hover': { color: 'primary.main' },
											}}
										>
											{item.label}
										</Link>
									</Box>
								);
							})}
						</Box>
					</Box>
				</Box>

				<Box
					sx={{
						pt: 4,
						borderTop: '1px solid',
						borderTopColor: 'divider',
						display: 'flex',
						flexDirection: { xs: 'column', md: 'row' },
						justifyContent: 'space-between',
						alignItems: 'center',
						gap: 2,
					}}
				>
					<Typography sx={{ fontSize: 12, color: 'text.disabled' }}>
						© 2026 PublyApp Inc. All rights reserved.
					</Typography>
					<Box sx={{ display: 'flex', gap: 3 }}>
						{['Terms of Service', 'Privacy Policy', 'Cookie Policy'].map(
							(label) => {
								return (
									<Link
										key={label}
										href="#"
										underline="none"
										sx={{
											fontSize: 12,
											color: 'text.disabled',
											transition: 'color 0.3s ease',
											'&:hover': { color: 'text.primary' },
										}}
									>
										{label}
									</Link>
								);
							},
						)}
					</Box>
				</Box>

				{/* Giant watermark */}
				<Box
					sx={{
						mt: 5,
						overflow: 'hidden',
						position: 'relative',
						height: { xs: 96, sm: 160 },
						pointerEvents: 'none',
						userSelect: 'none',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
					}}
				>
					<Typography
						component="h2"
						sx={(theme) => {
							return {
								fontSize: { xs: 80, sm: 180 },
								fontWeight: 900,
								color: 'rgba(0, 0, 0, 0.03)',
								letterSpacing: '-0.05em',
								width: '100%',
								textAlign: 'center',
								lineHeight: 1,
								...theme.applyStyles('dark', {
									color: 'rgba(255, 255, 255, 0.04)',
								}),
							};
						}}
					>
						PUBLYAPP
					</Typography>
				</Box>
			</Container>
		</FooterRoot>
	);
};
