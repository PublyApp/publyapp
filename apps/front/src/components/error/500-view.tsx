import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

import { useRouter } from '@/front/hooks/use-router';
import { useTranslate } from '@/front/hooks/use-translate';
import { SimpleCompactContent } from '@/front/layouts/simple/content';
import { SimpleLayout } from '@/front/layouts/simple/layout';

import { MotionContainer } from '../animate/motion-container';
import { varBounce } from '../animate/variants';
import { Iconify } from '../iconify';

// ----------------------------------------------------------------------

type View500Props = {
	withLayout?: boolean;
};

export const View500 = ({ withLayout = true }: View500Props) => {
	const { t } = useTranslate();
	const router = useRouter();

	const renderContent = () => {
		return (
			<Container
				component={MotionContainer}
				sx={{ textAlign: 'center', py: { xs: 5, md: 10 } }}
			>
				<m.div variants={varBounce('in')}>
					<Box
						sx={{
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							width: 120,
							height: 120,
							borderRadius: '50%',
							bgcolor: 'error.lighter',
							mb: 3,
						}}
					>
						<Iconify
							icon="solar:danger-triangle-bold"
							width={64}
							sx={{ color: 'error.main' }}
						/>
					</Box>
				</m.div>

				<m.div variants={varBounce('in')}>
					<Typography
						variant="h1"
						sx={(theme) => ({
							fontSize: { xs: '4rem', md: '6rem' },
							fontWeight: 800,
							color: theme.palette.error.main,
							mb: 2,
							lineHeight: 1,
						})}
					>
						500
					</Typography>
				</m.div>

				<m.div variants={varBounce('in')}>
					<Typography variant="h4" sx={{ mb: 2 }}>
						{t('error-500-title')}
					</Typography>
				</m.div>

				<m.div variants={varBounce('in')}>
					<Typography
						sx={{
							color: 'text.secondary',
							mb: 4,
							maxWidth: 480,
							mx: 'auto',
						}}
					>
						{t('error-500-description')}
					</Typography>
				</m.div>

				<m.div variants={varBounce('in')}>
					<Button
						size="large"
						variant="contained"
						color="primary"
						onClick={() => router.refresh()}
						startIcon={<Iconify icon="solar:restart-bold" width={20} />}
					>
						{t('reload-page')}
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
