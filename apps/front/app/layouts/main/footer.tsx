import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import { styled, type Breakpoint } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

// import { Iconify } from 'src/components/iconify';
// import { Logo } from 'src/components/logo';
// import { RouterLink } from 'src/routes/components';
// import { paths } from 'src/routes/paths';

import { Iconify } from '@/front/components/iconify/iconify';
import { Logo } from '@/front/components/logo/logo';
import { RouterLink } from '@/front/components/router-link';

// ----------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/naming-convention
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
	{ headline: 'Contact', children: [{ name: 'support@minimals.cc', href: '#' }] },
];

// ----------------------------------------------------------------------

const FooterRoot = styled('footer')(({ theme }) => {
	return {
		position: 'relative',
		backgroundColor: theme.vars.palette.background.default,
	};
});

export type FooterProps = React.ComponentProps<typeof FooterRoot>;

export const Footer = ({ sx, layoutQuery = 'md', ...other }: FooterProps & { layoutQuery?: Breakpoint }) => {
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
								[theme.breakpoints.up(layoutQuery)]: { justifyContent: 'space-between' },
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
							The starting point for your next project with Minimal UI Kit, built on the newest version of Material-UI
							©, ready to be customized to your style.
						</Typography>

						<Box
							sx={(theme) => {
								return {
									mt: 3,
									mb: 5,
									display: 'flex',
									justifyContent: 'center',
									[theme.breakpoints.up(layoutQuery)]: { mb: 0, justifyContent: 'flex-start' },
								};
							}}
						>
							{_socials.map((social) => {
								return (
									<IconButton key={social.label}>
										{social.value === 'twitter' && <Iconify icon="socials:twitter" />}
										{social.value === 'facebook' && <Iconify icon="socials:facebook" />}
										{social.value === 'instagram' && <Iconify icon="socials:instagram" />}
										{social.value === 'linkedin' && <Iconify icon="socials:linkedin" />}
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
												[theme.breakpoints.up(layoutQuery)]: { alignItems: 'flex-start' },
											};
										}}
									>
										<Typography component="div" variant="overline">
											{list.headline}
										</Typography>

										{list.children.map((link) => {
											return (
												<Link key={link.name} component={RouterLink} href={link.href} color="inherit" variant="body2">
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

export const HomeFooter = ({ sx, ...other }: FooterProps) => {
	return (
		<FooterRoot
			sx={[
				{
					py: 5,
					textAlign: 'center',
				},
				...(Array.isArray(sx) ? sx : [sx]),
			]}
			{...other}
		>
			<Container>
				<Logo />
				<Box sx={{ mt: 1, typography: 'caption' }}>
					© All rights reserved.
					{/* <br /> made by */}
					{/* <Link href="https://minimals.cc/"> minimals.cc </Link> */}
				</Box>
			</Container>
		</FooterRoot>
	);
};
