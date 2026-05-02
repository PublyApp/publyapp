import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import { styled } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';

// ----------------------------------------------------------------------

const FooterRoot = styled('footer')(({ theme }) => {
	return {
		position: 'relative',
		backgroundColor: theme.vars.palette.background.default,
	};
});

export type FooterProps = React.ComponentProps<typeof FooterRoot>;

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
