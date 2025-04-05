import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

import ServerErrorIllustration from '@/front/assets/illustrations/server-error-illustration';
import { SimpleCompactContent } from '@/front/layouts/simple/content';
import { SimpleLayout } from '@/front/layouts/simple/layout';

import { MotionContainer } from '../animate/motion-container';
import { varBounce } from '../animate/variants/bounce';
import { RouterLink } from '../router-link';

// ----------------------------------------------------------------------

type View500Props = {
	withLayout?: boolean;
};

export const View500 = ({ withLayout = true }: View500Props) => {
	const renderContent = () => {
		return (
			<Container component={MotionContainer}>
				<m.div variants={varBounce('in')}>
					<Typography variant="h3" sx={{ mb: 2 }}>
						500 Internal server error
					</Typography>
				</m.div>

				<m.div variants={varBounce('in')}>
					<Typography sx={{ color: 'text.secondary' }}>There was an error, please try again later.</Typography>
				</m.div>

				<m.div variants={varBounce('in')}>
					<ServerErrorIllustration sx={{ my: { xs: 5, sm: 10 } }} />
				</m.div>

				<Button component={RouterLink} href="/" size="large" variant="contained">
					Go to home
				</Button>
			</Container>
		);
	};

	if (!withLayout) {
		return <SimpleCompactContent layoutQuery="md">{renderContent()}</SimpleCompactContent>;
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
