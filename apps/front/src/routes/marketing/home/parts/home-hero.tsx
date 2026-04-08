import Box, { type BoxProps } from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import type { Breakpoint } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import {
	type MotionProps,
	type MotionValue,
	m,
	type SpringOptions,
	useMotionValueEvent,
	useScroll,
	useSpring,
	useTransform,
} from 'framer-motion';
import { useRef, useState } from 'react';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { MotionContainer, varFade } from '#app/components/animate/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

import { HeroBackground } from '../components/hero-background';

// ----------------------------------------------------------------------

const smKey: Breakpoint = 'sm';
const mdKey: Breakpoint = 'md';
const lgKey: Breakpoint = 'lg';

const motionProps: MotionProps = {
	variants: varFade('inUp', { distance: 24 }),
};

const HomeHeroHeading = () => {
	return (
		<m.div {...motionProps}>
			<Box
				component="h1"
				sx={[
					(theme) => {
						return {
							my: 0,
							mx: 'auto',
							maxWidth: 800,
							display: 'flex',
							flexWrap: 'wrap',
							typography: 'h2',
							justifyContent: 'center',
							fontFamily: theme.typography.fontSecondaryFamily,
							[theme.breakpoints.up(lgKey)]: {
								fontSize: theme.typography.pxToRem(72 + 10),
								lineHeight: '100px',
							},
						};
					},
				]}
			>
				<Box component="span" sx={{ width: 1, whiteSpace: 'nowrap' }}>
					Schedule Smarter,
				</Box>
				<Box
					component="span"
					sx={{
						display: 'flex',
						alignItems: 'center',
						gap: 3,
						whiteSpace: 'nowrap',
						flexWrap: 'nowrap',
					}}
				>
					<Box sx={{ opacity: 0.24 }}>Not</Box>
					<Box
						component={m.span}
						animate={{ backgroundPosition: '200% center' }}
						transition={{
							duration: 20,
							ease: 'linear',
							repeat: Number.POSITIVE_INFINITY,
							repeatType: 'reverse',
						}}
						sx={[
							(theme) => {
								return {
									...theme.mixins.textGradient(
										`300deg, ${theme.vars.palette.primary.main} 0%, ${theme.vars.palette.warning.main} 25%, ${theme.vars.palette.primary.main} 50%, ${theme.vars.palette.warning.main} 75%, ${theme.vars.palette.primary.main} 100%`,
									),
									backgroundSize: '400%',
								};
							},
							{
								whiteSpace: 'nowrap',
							},
						]}
					>
						Harder.
					</Box>
				</Box>
			</Box>
		</m.div>
	);
};

const HomeHeroText = () => {
	return (
		<m.div {...motionProps}>
			<Typography
				variant="body2"
				sx={[
					(theme) => {
						return {
							mx: 'auto',
							[theme.breakpoints.up(smKey)]: { whiteSpace: 'pre' },
							[theme.breakpoints.up(lgKey)]: {
								fontSize: 20,
								lineHeight: '36px',
							},
						};
					},
				]}
			>
				Plan, schedule, and publish your social media content across all
				platforms — effortlessly.
			</Typography>
		</m.div>
	);
};

type HomeHeroButtonsProps = {
	signInLabel: string;
	signUpLabel: string;
};

const HomeHeroButtons = ({
	signInLabel,
	signUpLabel,
}: HomeHeroButtonsProps) => {
	return (
		<Box
			sx={{
				display: 'flex',
				flexWrap: 'wrap',
				justifyContent: 'center',
				gap: { xs: 1.5, sm: 2 },
			}}
		>
			<m.div {...motionProps}>
				<Stack spacing={2.5} sx={{ alignItems: 'center' }}>
					<Button
						component={RouterLink}
						href={FRONT_PATH_NAMES.auth.signup}
						color="inherit"
						size="large"
						variant="contained"
						startIcon={
							<Iconify width={24} icon={'solar:user-plus-outline' as never} />
						}
					>
						<span>{signUpLabel}</span>
					</Button>
				</Stack>
			</m.div>

			<m.div {...motionProps}>
				<Button
					color="inherit"
					size="large"
					variant="outlined"
					target="_blank"
					rel="noopener"
					href={FRONT_PATH_NAMES.auth.login}
					startIcon={<Iconify width={38} icon="solar:user-id-bold" />}
					sx={{ borderColor: 'text.primary' }}
				>
					{signInLabel}
				</Button>
			</m.div>
		</Box>
	);
};

export const HomeHero = ({ sx, ...other }: BoxProps) => {
	const { t } = useTranslate();
	const scrollProgress = useScrollPercent();

	const mdUp = useMediaQuery((theme) => {
		return theme.breakpoints.up(mdKey);
	});

	const distance = mdUp ? scrollProgress.percent : 0;

	const y1 = useTransformY(scrollProgress.scrollY, distance * -7);
	const y2 = useTransformY(scrollProgress.scrollY, distance * -6);
	const y4 = useTransformY(scrollProgress.scrollY, distance * -4);

	const opacity: MotionValue<number> = useTransform(
		scrollProgress.scrollY,
		[0, 1],
		[1, mdUp ? Number((1 - scrollProgress.percent / 100).toFixed(1)) : 1],
	);

	return (
		<Box
			ref={scrollProgress.elementRef}
			component="section"
			sx={[
				(theme) => {
					return {
						overflow: 'hidden',
						position: 'relative',
						[theme.breakpoints.up(mdKey)]: {
							minHeight: 760,
							height: '100vh',
							maxHeight: 1440,
							display: 'block',
							willChange: 'opacity',
							mt: 'calc(var(--layout-header-desktop-height) * -1)',
						},
					};
				},
				...(Array.isArray(sx) ? sx : [sx]),
			]}
			{...other}
		>
			<Box
				component={m.div}
				style={{ opacity }}
				sx={[
					(theme) => {
						return {
							width: 1,
							display: 'flex',
							position: 'relative',
							flexDirection: 'column',
							transition: theme.transitions.create(['opacity']),
							[theme.breakpoints.up(mdKey)]: {
								height: 1,
								position: 'fixed',
								maxHeight: 'inherit',
							},
						};
					},
				]}
			>
				<Container
					component={MotionContainer}
					sx={[
						(theme) => {
							return {
								py: 3,
								gap: 5,
								zIndex: 9,
								display: 'flex',
								alignItems: 'center',
								flexDirection: 'column',
								[theme.breakpoints.up(mdKey)]: {
									flex: '1 1 auto',
									justifyContent: 'center',
									py: 'var(--layout-header-desktop-height)',
								},
							};
						},
					]}
				>
					<Stack spacing={3} sx={{ textAlign: 'center' }}>
						<m.div style={{ y: y1 }}>
							<HomeHeroHeading />
						</m.div>
						<m.div style={{ y: y2 }}>
							<HomeHeroText />
						</m.div>
					</Stack>

					<m.div style={{ y: y4 }}>
						<HomeHeroButtons
							signInLabel={t('sign-in')}
							signUpLabel={t('sign-up')}
						/>
					</m.div>
				</Container>

				<HeroBackground />
			</Box>
		</Box>
	);
};

// ----------------------------------------------------------------------

const useTransformY = (value: MotionValue<number>, distance: number) => {
	const physics: SpringOptions = {
		mass: 0.1,
		damping: 20,
		stiffness: 300,
		restDelta: 0.001,
	};

	return useSpring(useTransform(value, [0, 1], [0, distance]), physics);
};

const useScrollPercent = () => {
	const elementRef = useRef<HTMLDivElement>(null);

	const { scrollY } = useScroll();

	const [percent, setPercent] = useState(0);

	useMotionValueEvent(scrollY, 'change', (scrollHeight) => {
		let heroHeight = 0;

		if (elementRef.current) {
			heroHeight = elementRef.current.offsetHeight;
		}

		const scrollPercent = Math.floor((scrollHeight / heroHeight) * 100);

		if (scrollPercent >= 100) {
			setPercent(100);
		} else {
			setPercent(Math.floor(scrollPercent));
		}
	});

	return { elementRef, percent, scrollY };
};
