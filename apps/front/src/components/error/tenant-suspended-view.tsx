import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

import { useTranslate } from '@/front/hooks/use-translate';
import { SimpleCompactContent } from '@/front/layouts/simple/content';
import { SimpleLayout } from '@/front/layouts/simple/layout';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';

import { MotionContainer } from '../animate/motion-container';
import { varBounce } from '../animate/variants';
import { Iconify } from '../iconify';
import { RouterLink } from '../router-link';

// ----------------------------------------------------------------------

type ViewTenantSuspendedProps = {
	withLayout?: boolean;
};

export const ViewTenantSuspended = ({
	withLayout = true,
}: ViewTenantSuspendedProps) => {
	const { t } = useTranslate();

	const renderContent = () => {
		return (
			<Container
				component={MotionContainer}
				sx={{ textAlign: 'center', py: { xs: 5, md: 10 } }}
			>
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
								bgcolor: theme.palette.warning.lighter,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
							})}
						>
							<Iconify
								icon="solar:shield-keyhole-bold-duotone"
								width={64}
								sx={(theme) => ({
									color: theme.palette.warning.main,
								})}
							/>
						</Box>
					</Box>
				</m.div>

				<m.div variants={varBounce('in')}>
					<Typography variant="h3" sx={{ mb: 2, fontWeight: 700 }}>
						{t('tenant-suspended-title')}
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
						{t('tenant-suspended-description')}{' '}
						<Link
							href="mailto:support@example.com"
							color="inherit"
							sx={{ fontWeight: 'bold' }}
						>
							{t('contact-support')}
						</Link>
					</Typography>
				</m.div>

				<m.div variants={varBounce('in')}>
					<Stack
						direction={{ xs: 'column', sm: 'row' }}
						spacing={2}
						justifyContent="center"
					>
						<Button
							component={RouterLink}
							href={FRONT_PATH_NAMES.tenant().organizations}
							size="large"
							variant="contained"
							sx={{ px: 4, py: 1.5 }}
						>
							{t('go-to-my-organizations')}
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
