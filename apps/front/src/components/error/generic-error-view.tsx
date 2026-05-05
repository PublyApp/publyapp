import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

import { useHomePath } from '@/front/hooks/use-home-path';
import { useRouter } from '@/front/hooks/use-router';
import { useTranslate } from '@/front/hooks/use-translate';
import { SimpleCompactContent } from '@/front/layouts/simple/content';
import { SimpleLayout } from '@/front/layouts/simple/layout';

import { MotionContainer } from '../animate/motion-container';
import { varBounce } from '../animate/variants';
import { Iconify } from '../iconify/iconify';
import { RouterLink } from '../router-link';

// ----------------------------------------------------------------------

type GenericErrorViewProps = {
	withLayout?: boolean;
	title?: string;
	description?: string;
	error?: Error | string;
};

export const GenericErrorView = ({
	withLayout = true,
	title,
	description,
	error,
}: GenericErrorViewProps) => {
	const { t } = useTranslate();
	const router = useRouter();
	const homePath = useHomePath();

	const errorMessage = error instanceof Error ? error.message : error;

	const renderContent = () => {
		return (
			<Container component={MotionContainer}>
				<m.div variants={varBounce('in')}>
					<Box
						sx={{
							display: 'flex',
							justifyContent: 'center',
							mb: 3,
						}}
					>
						<Iconify
							icon="solar:danger-triangle-bold"
							width={80}
							sx={{ color: 'warning.main' }}
						/>
					</Box>
				</m.div>

				<m.div variants={varBounce('in')}>
					<Typography variant="h3" sx={{ mb: 2, textAlign: 'center' }}>
						{title || t('generic-error-title')}
					</Typography>
				</m.div>

				<m.div variants={varBounce('in')}>
					<Typography
						sx={{ color: 'text.secondary', mb: 2, textAlign: 'center' }}
					>
						{description || t('generic-error-description')}
					</Typography>
				</m.div>

				{errorMessage && (
					<m.div variants={varBounce('in')}>
						<Box
							sx={{
								p: 2,
								mb: 3,
								borderRadius: 1,
								bgcolor: 'error.lighter',
								border: 1,
								borderColor: 'error.light',
							}}
						>
							<Typography
								variant="body2"
								sx={{
									color: 'error.dark',
									fontFamily: 'monospace',
									wordBreak: 'break-word',
								}}
							>
								{errorMessage}
							</Typography>
						</Box>
					</m.div>
				)}

				<m.div variants={varBounce('in')}>
					<Stack
						direction={{ xs: 'column', sm: 'row' }}
						spacing={2}
						justifyContent="center"
					>
						<Button
							size="large"
							variant="contained"
							onClick={() => router.refresh()}
						>
							{t('try-again')}
						</Button>
						<Button
							component={RouterLink}
							href={homePath}
							size="large"
							variant="outlined"
						>
							{t('go-to-home')}
						</Button>
					</Stack>
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
