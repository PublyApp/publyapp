import { useHomePath } from '@/front/hooks/use-home-path';
import { useTranslate } from '@/front/hooks/use-translate';
import { SimpleCompactContent } from '@/front/layouts/simple/content';
import { SimpleLayout } from '@/front/layouts/simple/layout';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';
import { MotionContainer } from '../animate/motion-container';
import { varBounce } from '../animate/variants';
import { RouterLink } from '../router-link';

// ----------------------------------------------------------------------

type NotFoundViewProps = {
	withLayout?: boolean;
	title?: string;
	description?: string;
};

export const NotFoundView = ({
	withLayout = true,
	title,
	description,
}: NotFoundViewProps) => {
	const { t } = useTranslate();
	const homePath = useHomePath();

	const renderContent = () => {
		return (
			<Container component={MotionContainer} sx={{ textAlign: 'center' }}>
				<m.div variants={varBounce('in')}>
					<Typography
						variant="h1"
						sx={(theme) => ({
							mb: 3,
							background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
							WebkitBackgroundClip: 'text',
							WebkitTextFillColor: 'transparent',
							fontSize: { xs: '8rem', sm: '10rem', md: '12rem' },
							fontWeight: 800,
							lineHeight: 1,
							letterSpacing: '-0.02em',
							textShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
						})}
					>
						404
					</Typography>
				</m.div>

				<m.div variants={varBounce('in')}>
					<Typography variant="h3" sx={{ mb: 2 }}>
						{title || t('page-not-found')}
					</Typography>
				</m.div>

				<m.div variants={varBounce('in')}>
					<Typography
						sx={{
							color: 'text.secondary',
							maxWidth: 480,
							mx: 'auto',
						}}
					>
						{description || t('not-found-sentence')}
					</Typography>
				</m.div>

				<m.div variants={varBounce('in')}>
					<Box sx={{ my: { xs: 5, sm: 8 } }} />
				</m.div>

				<m.div variants={varBounce('in')}>
					<Button
						component={RouterLink}
						href={homePath}
						size="large"
						variant="contained"
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
