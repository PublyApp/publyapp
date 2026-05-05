import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

import { useHomePath } from '@/front/hooks/use-home-path';
import { useTranslate } from '@/front/hooks/use-translate';
import { SimpleCompactContent } from '@/front/layouts/simple/content';
import { SimpleLayout } from '@/front/layouts/simple/layout';

import { MotionContainer } from '../animate/motion-container';
import { varBounce } from '../animate/variants';
import { Iconify } from '../iconify';
import { RouterLink } from '../router-link';

// ----------------------------------------------------------------------

type View403Props = {
	withLayout?: boolean;
};

export const View403 = ({ withLayout = true }: View403Props) => {
	const { t } = useTranslate();
	const homePath = useHomePath();

	const renderContent = () => {
		return (
			<Container
				component={MotionContainer}
				sx={{ textAlign: 'center', py: { xs: 5, md: 10 } }}
			>
				<m.div variants={varBounce('in')}>
					<Typography
						variant="h1"
						sx={(theme) => ({
							mb: 2,
							fontSize: { xs: '6rem', md: '10rem' },
							fontWeight: 800,
							lineHeight: 1,
							background: `linear-gradient(135deg, ${theme.palette.error.main} 0%, ${theme.palette.error.dark} 100%)`,
							backgroundClip: 'text',
							WebkitBackgroundClip: 'text',
							WebkitTextFillColor: 'transparent',
							textShadow: '0px 4px 20px rgba(0, 0, 0, 0.1)',
						})}
					>
						403
					</Typography>
				</m.div>

				<m.div variants={varBounce('in')}>
					<Box
						sx={{
							display: 'flex',
							justifyContent: 'center',
							alignItems: 'center',
							mb: 3,
						}}
					>
						<Box
							sx={(theme) => ({
								p: 2,
								borderRadius: '50%',
								bgcolor: theme.palette.error.lighter,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
							})}
						>
							<Iconify
								icon="solar:forbidden-circle-bold"
								width={64}
								sx={(theme) => ({
									color: theme.palette.error.main,
								})}
							/>
						</Box>
					</Box>
				</m.div>

				<m.div variants={varBounce('in')}>
					<Typography variant="h3" sx={{ mb: 2, fontWeight: 700 }}>
						{t('no-permission')}
					</Typography>
				</m.div>

				<m.div variants={varBounce('in')}>
					<Typography
						sx={{
							color: 'text.secondary',
							mb: 5,
							maxWidth: 480,
							mx: 'auto',
							lineHeight: 1.6,
						}}
					>
						{t('forbidden-description')}
					</Typography>
				</m.div>

				<m.div variants={varBounce('in')}>
					<Button
						component={RouterLink}
						href={homePath}
						size="large"
						variant="contained"
						sx={{ px: 4, py: 1.5 }}
					>
						{t('go-to-home')}
					</Button>
				</m.div>
			</Container>
		);
	};

	if (!withLayout) {
		return (
			<SimpleCompactContent layoutQuery="md">
				{renderContent()}
			</SimpleCompactContent>
		);
	}

	return (
		<SimpleLayout
			slotProps={{
				content: { compact: true },
			}}
		>
			{renderContent()}
		</SimpleLayout>
	);
};
