import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';
import { varAlpha } from 'minimal-shared/utils';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { MotionViewport, varFade } from '#app/components/animate/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';

// ----------------------------------------------------------------------

const noiseOverlayUrl =
	"url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")";

export const HomeCta = () => {
	return (
		<Box component="section" sx={{ pt: 5, pb: 14, px: { xs: 2, md: 3 } }}>
			<Container maxWidth="lg" component={MotionViewport}>
				<m.div variants={varFade('inUp', { distance: 24 })}>
					<Box
						sx={{
							bgcolor: '#242424',
							borderRadius: '40px',
							p: { xs: 6, md: 10 },
							textAlign: 'center',
							position: 'relative',
							overflow: 'hidden',
							boxShadow: '0 24px 48px -20px rgba(0,0,0,0.30)',
							border: '1px solid rgba(255,255,255,0.10)',
						}}
					>
						<Box
							sx={(theme) => {
								return {
									position: 'absolute',
									inset: 0,
									borderRadius: '40px',
									pointerEvents: 'none',
									background: `radial-gradient(circle at 0% 100%, ${varAlpha(theme.vars.palette.primary.mainChannel, 0.1)} 0%, transparent 35%)`,
								};
							}}
						/>
						<Box
							sx={{
								position: 'absolute',
								top: 0,
								left: 0,
								right: 0,
								height: '1px',
								background:
									'linear-gradient(to right, transparent, rgba(255,255,255,0.10), transparent)',
								pointerEvents: 'none',
							}}
						/>
						<Box
							sx={{
								position: 'absolute',
								inset: 0,
								backgroundImage: noiseOverlayUrl,
								opacity: 0.04,
								mixBlendMode: 'overlay',
								pointerEvents: 'none',
								borderRadius: '40px',
							}}
						/>

						<Box sx={{ position: 'relative', zIndex: 1 }}>
							<Box
								sx={{
									display: 'inline-block',
									px: 2,
									py: 0.75,
									bgcolor: 'rgba(255,255,255,0.10)',
									backdropFilter: 'blur(12px)',
									border: '1px solid rgba(255,255,255,0.20)',
									color: 'common.white',
									borderRadius: 999,
									fontSize: 12,
									fontWeight: 700,
									mb: 3,
									letterSpacing: '0.05em',
									textTransform: 'uppercase',
								}}
							>
								<Iconify
									icon={'ph:lightning-fill' as never}
									width={14}
									sx={{ verticalAlign: 'text-bottom', mr: 0.5 }}
								/>{' '}
								Start Scaling Today
							</Box>

							<Typography
								component="h2"
								sx={{
									fontSize: { xs: 36, md: 56 },
									color: 'common.white',
									fontWeight: 800,
									mb: 3,
									lineHeight: 1.1,
									letterSpacing: '-0.02em',
								}}
							>
								Unlock the Power of
								<br />
								Automated Social Growth
							</Typography>

							<Typography
								sx={{
									color: 'primary.lighter',
									fontSize: 18,
									maxWidth: 640,
									mx: 'auto',
									mb: 5,
									fontWeight: 500,
								}}
							>
								Join 10,000+ brands organizing the chaos. We handle the
								publishing, you handle the community.
							</Typography>

							<Box
								component={m.div}
								initial="rest"
								animate="rest"
								whileHover="hover"
								whileTap={{ scale: 0.97 }}
								variants={{
									rest: { y: 0, scale: 1 },
									hover: { y: -6, scale: 1.04 },
								}}
								transition={{
									type: 'spring',
									stiffness: 400,
									damping: 18,
								}}
								sx={{ display: 'inline-flex', mx: 'auto' }}
							>
								<Button
									component={RouterLink}
									href={FRONT_PATH_NAMES.auth.signup}
									endIcon={
										<Box
											component={m.div}
											variants={{
												rest: { x: 0, scale: 1 },
												hover: { x: 4, scale: 1.1 },
											}}
											transition={{
												type: 'spring',
												stiffness: 500,
												damping: 16,
											}}
											sx={{
												width: 32,
												height: 32,
												borderRadius: '50%',
												bgcolor: 'rgba(255,255,255,0.15)',
												display: 'inline-flex',
												alignItems: 'center',
												justifyContent: 'center',
											}}
										>
											<Iconify
												icon={'ph:arrow-right-bold' as never}
												width={16}
											/>
										</Box>
									}
									sx={(theme) => {
										return {
											bgcolor: 'primary.main',
											color: 'common.white',
											px: 5,
											py: 2.5,
											borderRadius: 2,
											fontWeight: 700,
											fontSize: 18,
											boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
											border: '1px solid rgba(255,255,255,0.10)',
											outline: `2px solid ${varAlpha(theme.vars.palette.primary.mainChannel, 0.3)}`,
											outlineOffset: 2,
											'&:hover': {
												bgcolor: 'primary.main',
												boxShadow: `0 28px 60px -12px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.6)}`,
												outline: `2px solid ${varAlpha(theme.vars.palette.primary.mainChannel, 0.5)}`,
											},
										};
									}}
								>
									Start for Free
								</Button>
							</Box>

							<Typography
								sx={{
									color: 'rgba(255,255,255,0.6)',
									fontSize: 14,
									mt: 3,
									fontWeight: 500,
								}}
							>
								14-day free trial. No credit card required.
							</Typography>
						</Box>
					</Box>
				</m.div>
			</Container>
		</Box>
	);
};
