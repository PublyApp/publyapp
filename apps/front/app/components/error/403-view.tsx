import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

import ForbiddenIllustration from '@/front/assets/illustrations/forbidden-illustration';
import { SimpleLayout } from '@/front/layouts/simple/layout';

import { MotionContainer } from '../animate/motion-container';
import { varBounce } from '../animate/variants/bounce';
import { RouterLink } from '../router-link';

// ----------------------------------------------------------------------

export const View403 = () => {
	return (
		<SimpleLayout
			slotProps={{
				content: { compact: true },
			}}
		>
			<Container component={MotionContainer}>
				<m.div variants={varBounce('in')}>
					<Typography variant="h3" sx={{ mb: 2 }}>
						No permission
					</Typography>
				</m.div>

				<m.div variants={varBounce('in')}>
					<Typography sx={{ color: 'text.secondary' }}>
						The page you're trying to access has restricted access. Please refer to your system administrator.
					</Typography>
				</m.div>

				<m.div variants={varBounce('in')}>
					<ForbiddenIllustration sx={{ my: { xs: 5, sm: 10 } }} />
				</m.div>

				<Button component={RouterLink} href="/" size="large" variant="contained">
					Go to home
				</Button>
			</Container>
		</SimpleLayout>
	);
};
