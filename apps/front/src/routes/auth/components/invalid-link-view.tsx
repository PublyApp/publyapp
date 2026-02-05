import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import _ from 'lodash';

import { Iconify } from '@/front/components/iconify/iconify';
import { RouterLink } from '@/front/components/router-link';
import { useTranslate } from '@/front/hooks/use-translate';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';

const InvalidLinkView = ({
	error,
	forceIsInvalid = false,
}: {
	error?: unknown;
	forceIsInvalid?: boolean;
}) => {
	const { t } = useTranslate();

	const renderInvalidLinkView = () => {
		return (
			<Box>
				<Typography variant="h4" color="text.primary" mb={2}>
					{t('invalid-item', { item: t('link') })}
				</Typography>
				<Typography variant="body1" color="text.secondary" mb={3}>
					{t('invalid-email-verification-link-description')}
				</Typography>
				<Button
					component={RouterLink}
					href={FRONT_PATH_NAMES.auth.verifyEmail}
					variant="text"
					color="primary"
					endIcon={<Iconify icon="eva:arrow-forward-fill" />}
				>
					{t('request-new-verification-link')}
				</Button>
			</Box>
		);
	};

	if (!forceIsInvalid && _.isNil(error)) {
		throw new Error('Error should not be nil');
	}

	if (forceIsInvalid) {
		return renderInvalidLinkView();
	}

	throw error;
};

export default InvalidLinkView;
