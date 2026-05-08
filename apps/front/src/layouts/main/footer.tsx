import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import { styled } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { FEATURES } from '#app/lib/features/flags.ts';

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
	{ label: 'Features', href: '/#features' },
	...(FEATURES.marketing.integrations
		? [{ label: 'Integrations', href: FRONT_PATH_NAMES.marketing.integrations }]
		: []),
	{ label: 'Pricing', href: FRONT_PATH_NAMES.marketing.pricing },
	...(FEATURES.marketing.changelog
		? [{ label: 'Changelog', href: FRONT_PATH_NAMES.marketing.changelog }]
		: []),
];

const HOME_FOOTER_COMPANY_LINKS = [
	...(FEATURES.marketing.about
		? [{ label: 'About', href: FRONT_PATH_NAMES.marketing.about }]
		: []),
	...(FEATURES.marketing.contact
		? [{ label: 'Contact', href: FRONT_PATH_NAMES.marketing.contact }]
		: []),
];

type FooterLink =
	| { label: string; href: string; onClick?: never }
	| { label: string; onClick: () => void; href?: never };

const HOME_FOOTER_LEGAL_LINKS: FooterLink[] = [
	{ label: 'Terms of Use', href: FRONT_PATH_NAMES.marketing.terms },
	{ label: 'Privacy Policy', href: FRONT_PATH_NAMES.marketing.privacy },
	{ label: 'Cookie Policy', href: FRONT_PATH_NAMES.marketing.cookies },
	...(FEATURES.marketing.security
		? [
				{
					label: 'Security',
					href: FRONT_PATH_NAMES.marketing.security,
				} satisfies FooterLink,
			]
		: []),
	...(FEATURES.marketing.cookieConsent
		? [
				{
					label: 'Cookie Preferences',
					onClick: () => {
						window.__cookieConsent?.openPreferences();
					},
				} satisfies FooterLink,
			]
		: []),
];

const HOME_FOOTER_RESOURCE_LINKS = [
	...(FEATURES.marketing.blog
		? [{ label: 'Blog', href: FRONT_PATH_NAMES.marketing.blog }]
		: []),
	...(FEATURES.marketing.help
		? [{ label: 'Help Center', href: FRONT_PATH_NAMES.marketing.help }]
		: []),
	...(FEATURES.marketing.community
		? [{ label: 'Community', href: FRONT_PATH_NAMES.marketing.community }]
		: []),
	...(FEATURES.marketing.contact
		? [{ label: 'Contact Support', href: FRONT_PATH_NAMES.marketing.contact }]
		: []),
];

const HOME_FOOTER_SOCIALS: { label: string; icon: string }[] = [
	{ label: 'X', icon: 'ph:x-logo-fill' },
	{ label: 'Instagram', icon: 'ph:instagram-logo-fill' },
	{ label: 'LinkedIn', icon: 'ph:linkedin-logo-fill' },
];

type FooterLinkColumn = {
	heading: string;
	links: FooterLink[];
};

// Empty columns are filtered out so the grid doesn't render orphan headings
// when all entries in a column are flagged off.
const HOME_FOOTER_LINK_COLUMNS: FooterLinkColumn[] = [
	{ heading: 'Product', links: HOME_FOOTER_PRODUCT_LINKS },
	{ heading: 'Company', links: HOME_FOOTER_COMPANY_LINKS },
	{ heading: 'Resources', links: HOME_FOOTER_RESOURCE_LINKS },
].filter((column) => {
	return column.links.length > 0;
});

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
						gridTemplateColumns: {
							xs: '1fr',
							md: `repeat(${2 + HOME_FOOTER_LINK_COLUMNS.length}, 1fr)`,
						},
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

					{HOME_FOOTER_LINK_COLUMNS.map((column) => {
						return (
							<Box key={column.heading}>
								<Typography
									sx={{
										fontWeight: 700,
										fontSize: 14,
										color: 'text.primary',
										mb: 2,
									}}
								>
									{column.heading}
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
									{column.links.map((item) => {
										if ('href' in item && item.href !== undefined) {
											return (
												<Box component="li" key={item.label}>
													<Link
														component={RouterLink}
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
										}
										return (
											<Box component="li" key={item.label}>
												<Box
													component="button"
													type="button"
													onClick={item.onClick}
													sx={{
														fontSize: 14,
														color: 'text.secondary',
														transition: 'color 0.3s ease',
														background: 'none',
														border: 'none',
														padding: 0,
														cursor: 'pointer',
														font: 'inherit',
														textAlign: 'left',
														'&:hover': { color: 'primary.main' },
													}}
												>
													{item.label}
												</Box>
											</Box>
										);
									})}
								</Box>
							</Box>
						);
					})}
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
						{HOME_FOOTER_LEGAL_LINKS.map((item) => {
							if ('href' in item && item.href !== undefined) {
								return (
									<Link
										key={item.label}
										component={RouterLink}
										href={item.href}
										underline="none"
										sx={{
											fontSize: 12,
											color: 'text.disabled',
											transition: 'color 0.3s ease',
											'&:hover': { color: 'text.primary' },
										}}
									>
										{item.label}
									</Link>
								);
							}
							return (
								<Box
									key={item.label}
									component="button"
									type="button"
									onClick={item.onClick}
									sx={{
										fontSize: 12,
										color: 'text.disabled',
										transition: 'color 0.3s ease',
										background: 'none',
										border: 'none',
										padding: 0,
										cursor: 'pointer',
										font: 'inherit',
										textAlign: 'left',
										'&:hover': { color: 'text.primary' },
									}}
								>
									{item.label}
								</Box>
							);
						})}
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
