import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

// import ForbiddenIllustration from '@/front/assets/illustrations/forbidden-illustration';
import { SimpleLayout } from '@/front/layouts/simple/layout';

import { MotionContainer } from '../animate/motion-container';
import { RouterLink } from '../router-link';
import { SimpleCompactContent } from '@/front/layouts/simple/content';

// ----------------------------------------------------------------------

type View403Props = {
	withLayout?: boolean;
};

export const View403 = ({ withLayout = true }: View403Props) => {
	const renderContent = () => {
		return (
			<Container component={MotionContainer}>
				<m.div /* variants={varBounce('in')} */>
					<Typography
						variant="h5"
						sx={(theme) => ({ mb: 0, color: theme.palette.primary.main })}
					>
						403
					</Typography>
				</m.div>

				<m.div /* variants={varBounce('in')} */>
					<Typography variant="h3" sx={{ mb: 2 }}>
						No permission
					</Typography>
				</m.div>

				<m.div /* variants={varBounce('in')} */>
					<Typography sx={{ color: 'text.secondary', mb: 2 }}>
						The page you're trying to access has restricted access. Please refer
						to your system administrator.
					</Typography>
				</m.div>

				{/* <m.div variants={varBounce('in')}>
					<ForbiddenIllustration sx={{ my: { xs: 5, sm: 10 } }} />
				</m.div> */}

				<Button
					component={RouterLink}
					href="/"
					size="large"
					variant="contained"
				>
					Go to home
				</Button>
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
