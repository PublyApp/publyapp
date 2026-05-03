import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { varAlpha } from 'minimal-shared/utils';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { IconifyName } from '#app/components/iconify/register-icons.ts';
import { RouterLink } from '#app/components/router-link.tsx';

// ----------------------------------------------------------------------

type CtaConfig = {
	label: string;
	href: string;
};

type MarketingHeroProps = {
	eyebrow: string;
	eyebrowIcon?: IconifyName;
	title: string;
	subhead: string;
	primaryCta?: CtaConfig;
	secondaryCta?: CtaConfig;
};

// ----------------------------------------------------------------------

const isExternalHref = (href: string): boolean => {
	return href.startsWith('http') || href.startsWith('mailto:');
};

const PrimaryCtaButton = ({ cta }: { cta: CtaConfig }) => {
	const external = isExternalHref(cta.href);
	return (
		<Box
			component={external ? 'a' : RouterLink}
			href={cta.href}
			sx={(theme) => ({
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				py: 1.75,
				px: 3.5,
				borderRadius: 2,
				fontWeight: 700,
				fontSize: 16,
				textDecoration: 'none',
				cursor: 'pointer',
				bgcolor: 'primary.main',
				color: 'common.white',
				boxShadow: `0 12px 24px -12px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.5)}`,
				transition: 'transform 240ms ease, box-shadow 240ms ease',
				'&:hover': {
					transform: 'translateY(-2px)',
					boxShadow: `0 16px 32px -12px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.6)}`,
				},
			})}
		>
			{cta.label}
		</Box>
	);
};

const SecondaryCtaButton = ({ cta }: { cta: CtaConfig }) => {
	const external = isExternalHref(cta.href);
	return (
		<Box
			component={external ? 'a' : RouterLink}
			href={cta.href}
			sx={{
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				py: 1.75,
				px: 3.5,
				borderRadius: 2,
				fontWeight: 600,
				fontSize: 16,
				textDecoration: 'none',
				cursor: 'pointer',
				bgcolor: 'transparent',
				color: 'text.primary',
				border: '1px solid',
				borderColor: 'divider',
				transition: 'transform 240ms ease, box-shadow 240ms ease',
				'&:hover': {
					transform: 'translateY(-2px)',
					boxShadow: '0 8px 16px -8px rgba(17,24,39,0.10)',
				},
			}}
		>
			{cta.label}
		</Box>
	);
};

// ----------------------------------------------------------------------

export const MarketingHero = ({
	eyebrow,
	eyebrowIcon,
	title,
	subhead,
	primaryCta,
	secondaryCta,
}: MarketingHeroProps) => {
	return (
		<Box component="section">
			<Container
				maxWidth="lg"
				sx={{ pt: { xs: 8, md: 14 }, pb: { xs: 6, md: 8 } }}
			>
				<Stack
					spacing={3}
					sx={{ maxWidth: 760, mx: 'auto', textAlign: 'center' }}
				>
					{eyebrowIcon ? (
						<Box
							sx={(theme) => ({
								alignSelf: 'center',
								display: 'inline-flex',
								alignItems: 'center',
								gap: 0.75,
								px: 1.5,
								py: 0.75,
								borderRadius: 999,
								bgcolor: varAlpha(theme.vars.palette.primary.mainChannel, 0.1),
								color: 'primary.main',
								fontSize: 12,
								fontWeight: 700,
								textTransform: 'uppercase',
								letterSpacing: '0.12em',
							})}
						>
							<Iconify icon={eyebrowIcon} width={14} />
							{eyebrow}
						</Box>
					) : (
						<Typography
							sx={{
								fontSize: 12,
								fontWeight: 700,
								textTransform: 'uppercase',
								letterSpacing: '0.12em',
								color: 'primary.main',
							}}
						>
							{eyebrow}
						</Typography>
					)}
					<Typography
						component="h1"
						sx={{
							fontSize: { xs: 36, md: 56 },
							fontWeight: 800,
							lineHeight: 1.1,
							letterSpacing: '-0.02em',
							color: 'text.primary',
						}}
					>
						{title}
					</Typography>
					<Typography
						sx={{
							fontSize: { xs: 16, md: 18 },
							color: 'text.secondary',
							lineHeight: 1.6,
							maxWidth: 640,
							mx: 'auto',
						}}
					>
						{subhead}
					</Typography>
					{(primaryCta || secondaryCta) && (
						<Stack
							direction={{ xs: 'column', sm: 'row' }}
							spacing={2}
							sx={{ justifyContent: 'center', pt: 2 }}
						>
							{primaryCta ? <PrimaryCtaButton cta={primaryCta} /> : null}
							{secondaryCta ? <SecondaryCtaButton cta={secondaryCta} /> : null}
						</Stack>
					)}
				</Stack>
			</Container>
		</Box>
	);
};
