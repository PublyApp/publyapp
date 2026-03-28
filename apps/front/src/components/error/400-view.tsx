import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

import { useHomePath } from '#app/hooks/use-home-path.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { SimpleCompactContent } from '#app/layouts/simple/content.tsx';
import { SimpleLayout } from '#app/layouts/simple/layout.tsx';

import { MotionContainer } from '../animate/motion-container';
import { varBounce } from '../animate/variants';
import { RouterLink } from '../router-link';

// ----------------------------------------------------------------------

type View400Props = {
	withLayout?: boolean;
	title?: string;
	description?: string;
};

const View400 = ({ withLayout = true, title, description }: View400Props) => {
	const { t } = useTranslate();
	const homePath = useHomePath();

	const renderContent = () => {
		return (
			<Container component={MotionContainer} sx={{ textAlign: 'center' }}>
				<m.div variants={varBounce('in')}>
					<Box
						sx={{
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							mb: 3,
						}}
					>
						<Typography
							variant="h1"
							sx={(theme) => ({
								fontSize: { xs: '6rem', sm: '8rem', md: '10rem' },
								fontWeight: 800,
								lineHeight: 1,
								background: `linear-gradient(135deg, ${theme.palette.warning.main} 0%, ${theme.palette.error.main} 100%)`,
								backgroundClip: 'text',
								WebkitBackgroundClip: 'text',
								WebkitTextFillColor: 'transparent',
								textShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
							})}
						>
							400
						</Typography>
					</Box>
				</m.div>

				<m.div variants={varBounce('in')}>
					<Typography
						variant="h3"
						sx={{
							mb: 2,
							fontWeight: 700,
						}}
					>
						{title ?? t('bad-request')}
					</Typography>
				</m.div>

				<m.div variants={varBounce('in')}>
					<Typography
						sx={{
							color: 'text.secondary',
							mb: 4,
							maxWidth: 480,
							mx: 'auto',
							lineHeight: 1.6,
						}}
					>
						{description ?? t('bad-request-sentence')}
					</Typography>
				</m.div>

				<m.div variants={varBounce('in')}>
					<Button
						component={RouterLink}
						href={homePath}
						size="large"
						variant="contained"
						sx={{
							px: 4,
							py: 1.5,
							fontWeight: 600,
						}}
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

export default View400;
