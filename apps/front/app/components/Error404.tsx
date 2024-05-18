import { Box, Button, Typography } from '@mui/material';
import { m } from 'framer-motion';

import { varBounce } from '@devist/ui-react/components/animate/variants/bounce';
import MotionContainer from '@devist/ui-react/components/MotionContainer';

import useTranslate from '../hooks/useTranslate';

import RouterLink from './RouterLink';

const Error404 = () => {
	const { t } = useTranslate();
	return (
		<MotionContainer>
			<m.div variants={varBounce().in}>
				<Typography variant="h3" paragraph>
					{t('page-not-found')}
				</Typography>
			</m.div>

			<m.div variants={varBounce().in}>
				<Typography sx={{ color: 'text.secondary' }}>{t('not-found-sentence')}</Typography>
			</m.div>

			<m.div variants={varBounce().in}>
				{/* <Image
					alt="404"
					src="/assets/illustrations/illustration_404.svg"
					sx={{
						mx: 'auto',
						maxWidth: 320,
						my: { xs: 5, sm: 8 },
					}}
				/> */}
				<Box
					src="/assets/illustrations/illustration_404.svg"
					component="img"
					sx={{
						mx: 'auto',
						maxWidth: 320,
						my: { xs: 5, sm: 8 },
					}}
				/>
			</m.div>

			<Button component={RouterLink} href="/" size="large" color="inherit" variant="contained">
				{t('go-to-home')}
			</Button>
		</MotionContainer>
	);
};

export default Error404;
