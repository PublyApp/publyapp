import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { SimpleCompactContent } from '#app/layouts/simple/content.tsx';
import { SimpleLayout } from '#app/layouts/simple/layout.tsx';

import { MotionContainer } from '../animate/motion-container';
import { varBounce } from '../animate/variants';
import { Iconify } from '../iconify';
import { RouterLink } from '../router-link';

// ----------------------------------------------------------------------

type View401Props = {
	withLayout?: boolean;
};

export const View401 = ({ withLayout = true }: View401Props) => {
	const { t } = useTranslate();

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
							icon="solar:shield-keyhole-bold-duotone"
							width={80}
							sx={(theme) => ({ color: theme.palette.primary.main })}
						/>
					</Box>
				</m.div>

				<m.div variants={varBounce('in')}>
					<Typography
						variant="h5"
						sx={(theme) => ({
							mb: 0,
							color: theme.palette.primary.main,
							textAlign: 'center',
						})}
					>
						401
					</Typography>
				</m.div>

				<m.div variants={varBounce('in')}>
					<Typography variant="h3" sx={{ mb: 2, textAlign: 'center' }}>
						{t('authentication-required')}
					</Typography>
				</m.div>

				<m.div variants={varBounce('in')}>
					<Typography
						sx={{ color: 'text.secondary', mb: 4, textAlign: 'center' }}
					>
						{t('unauthorized-description')}
					</Typography>
				</m.div>

				<Box
					sx={{
						display: 'flex',
						flexDirection: { xs: 'column', sm: 'row' },
						gap: 2,
						justifyContent: 'center',
					}}
				>
					<Button
						component={RouterLink}
						href={FRONT_PATH_NAMES.auth.login}
						size="large"
						variant="contained"
					>
						{t('go-to-login')}
					</Button>
					<Button
						component={RouterLink}
						href="/"
						size="large"
						variant="outlined"
					>
						{t('go-to-home')}
					</Button>
				</Box>
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
