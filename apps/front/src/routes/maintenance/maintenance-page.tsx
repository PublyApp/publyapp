import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

import { MotionContainer } from '@/front/components/animate/motion-container';
import { varBounce, varFade } from '@/front/components/animate/variants';
import { Iconify } from '@/front/components/iconify';
import { useTranslate } from '@/front/hooks/use-translate';

// ----------------------------------------------------------------------

const MaintenancePage = () => {
	const { t } = useTranslate();

	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				minHeight: '100vh',
				bgcolor: 'background.default',
				position: 'relative',
				overflow: 'hidden',
			}}
		>
			{/* Background Pattern */}
			<Box
				sx={{
					position: 'absolute',
					top: 0,
					left: 0,
					right: 0,
					bottom: 0,
					opacity: 0.04,
					backgroundImage:
						'radial-gradient(circle at 25px 25px, currentColor 2px, transparent 0)',
					backgroundSize: '50px 50px',
					pointerEvents: 'none',
				}}
			/>

			<Container
				component={MotionContainer}
				maxWidth="sm"
				sx={{
					textAlign: 'center',
					py: { xs: 5, md: 10 },
					position: 'relative',
					zIndex: 1,
				}}
			>
				{/* Animated Gear Icon */}
				<m.div variants={varBounce('in')}>
					<Box
						sx={{
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							position: 'relative',
							mb: 4,
						}}
					>
						{/* Outer rotating gear */}
						<Box
							component={m.div}
							animate={{ rotate: 360 }}
							transition={{
								duration: 8,
								repeat: Number.POSITIVE_INFINITY,
								ease: 'linear',
							}}
							sx={{
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								width: 140,
								height: 140,
								borderRadius: '50%',
								bgcolor: 'primary.lighter',
							}}
						>
							<Iconify
								icon="solar:settings-bold"
								width={80}
								sx={{ color: 'primary.main' }}
							/>
						</Box>

						{/* Inner pulsing indicator */}
						<Box
							component={m.div}
							animate={{
								scale: [1, 1.2, 1],
								opacity: [1, 0.7, 1],
							}}
							transition={{
								duration: 2,
								repeat: Number.POSITIVE_INFINITY,
								ease: 'easeInOut',
							}}
							sx={{
								position: 'absolute',
								bottom: 0,
								right: 0,
								width: 40,
								height: 40,
								borderRadius: '50%',
								bgcolor: 'warning.main',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								border: '3px solid',
								borderColor: 'background.default',
							}}
						>
							<Iconify
								icon="solar:clock-circle-bold"
								width={24}
								sx={{ color: 'warning.contrastText' }}
							/>
						</Box>
					</Box>
				</m.div>

				{/* Title */}
				<m.div variants={varBounce('in')}>
					<Typography
						variant="h2"
						sx={{
							mb: 2,
							fontWeight: 700,
						}}
					>
						{t('maintenance-title')}
					</Typography>
				</m.div>

				{/* Description */}
				<m.div variants={varFade('inUp')}>
					<Typography
						sx={{
							color: 'text.secondary',
							mb: 2,
							maxWidth: 480,
							mx: 'auto',
							lineHeight: 1.7,
						}}
					>
						{t('maintenance-description')}
					</Typography>
				</m.div>

				{/* Estimated Time */}
				<m.div variants={varFade('inUp')}>
					<Box
						sx={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 1,
							py: 1.5,
							px: 3,
							borderRadius: 2,
							bgcolor: 'grey.100',
							mb: 5,
						}}
					>
						<Iconify
							icon="solar:clock-circle-outline"
							width={20}
							sx={{ color: 'text.secondary' }}
						/>
						<Typography variant="body2" sx={{ color: 'text.secondary' }}>
							{t('maintenance-expected-back')}
						</Typography>
					</Box>
				</m.div>

				{/* Links Section */}
				<m.div variants={varFade('inUp')}>
					<Stack
						direction={{ xs: 'column', sm: 'row' }}
						spacing={2}
						justifyContent="center"
						alignItems="center"
						sx={{ mb: 4 }}
					>
						<Link
							href="#"
							underline="hover"
							sx={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: 0.5,
								color: 'primary.main',
								typography: 'body2',
								fontWeight: 600,
							}}
						>
							<Iconify icon="solar:info-circle-bold" width={18} />
							{t('maintenance-check-status')}
						</Link>

						<Box
							sx={{
								display: { xs: 'none', sm: 'block' },
								width: 4,
								height: 4,
								borderRadius: '50%',
								bgcolor: 'text.disabled',
							}}
						/>

						<Link
							href="mailto:support@example.com"
							underline="hover"
							sx={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: 0.5,
								color: 'text.secondary',
								typography: 'body2',
								fontWeight: 500,
							}}
						>
							{t('maintenance-contact-support')}
						</Link>
					</Stack>
				</m.div>

				{/* Social Links */}
				<m.div variants={varFade('inUp')}>
					<Typography
						variant="caption"
						sx={{ color: 'text.disabled', display: 'block', mb: 2 }}
					>
						{t('maintenance-follow-updates')}
					</Typography>

					<Stack direction="row" spacing={1.5} justifyContent="center">
						<Box
							component="a"
							href="https://x.com"
							target="_blank"
							rel="noopener noreferrer"
							sx={{
								display: 'inline-flex',
								alignItems: 'center',
								justifyContent: 'center',
								width: 40,
								height: 40,
								borderRadius: '50%',
								bgcolor: 'grey.200',
								color: 'text.primary',
								transition: 'all 0.2s ease-in-out',
								'&:hover': {
									bgcolor: 'grey.300',
									transform: 'translateY(-2px)',
								},
							}}
						>
							<Iconify icon="socials:twitter" width={20} />
						</Box>
					</Stack>
				</m.div>
			</Container>
		</Box>
	);
};

export default MaintenancePage;
