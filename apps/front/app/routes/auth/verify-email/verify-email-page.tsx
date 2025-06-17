import { Iconify } from '@/front/components/iconify/iconify';
import QueryDisplay from '@/front/components/query-display';
import { RouterLink } from '@/front/components/router-link';
import { useTranslate } from '@/front/hooks/use-translate';
import { useCheckEmailVerificationToken } from '@/front/lib/react-query/features/auth/auth.hooks';
import {
	FRONT_PATH_NAMES,
	X_CODE,
	queryParamKey,
} from '@/shared/lib/constants';
import type { Theme } from '@mui/material';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import _ from 'lodash';
import ParseRestError from 'packages/parse-rest-client/ParseRestError';
import { useSearchParams } from 'react-router';
import { serializeError } from 'serialize-error';

const boxStyles = (theme: Theme) => {
	return {
		[theme.breakpoints.up('md')]: {
			mt: `-${theme.typography.pxToRem(300)}`,
		},
	};
};

const VerifyEmailPage = () => {
	const { t } = useTranslate();
	const [searchParams] = useSearchParams();

	const token = searchParams.get(queryParamKey.token);

	const checkTokenQuery = useCheckEmailVerificationToken({
		variables: { token: token ?? '' },
		enabled: !!token,
	});

	if (!token) {
		return (
			<Box sx={boxStyles}>
				<InvalidTokenView />
			</Box>
		);
	}

	return (
		<Box sx={boxStyles}>
			<QueryDisplay
				query={checkTokenQuery}
				LoadingSlot={LoadingFormView}
				ErrorSlot={InvalidTokenView}
			>
				<Box>
					<Typography variant="h5" color="text.primary" sx={{ mb: 2 }}>
						{t('verify-email')}
					</Typography>
					<Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
						{t('verify-email-description')}
					</Typography>
					<Box sx={{ mt: 3 }}>
						<TextField
							fullWidth
							label={t('email-address')}
							type="email"
							name="email"
							autoComplete="email"
							required
						/>
						<Button
							fullWidth
							size="large"
							type="submit"
							variant="contained"
							sx={{ mt: 3 }}
						>
							{t('verify-email')}
						</Button>
					</Box>
				</Box>
			</QueryDisplay>
		</Box>
	);
};

export default VerifyEmailPage;

const LoadingFormView = () => {
	return (
		<Box sx={{ width: '100%', mt: 2 }}>
			<Skeleton variant="text" width="60%" height={40} />
			<Skeleton variant="text" width="80%" height={24} sx={{ mt: 1 }} />
			<Skeleton
				variant="rectangular"
				width="100%"
				height={120}
				sx={{ mt: 2, borderRadius: 1 }}
			/>
			<Skeleton variant="text" width="40%" height={24} sx={{ mt: 2 }} />
		</Box>
	);
};

const InvalidTokenView = ({ error }: { error?: unknown }) => {
	const { t } = useTranslate();

	if (error instanceof ParseRestError) {
		if (error.code === X_CODE.INVALID_TOKEN) {
			return (
				<Box>
					<Typography variant="h3" color="text.primary" mb={2}>
						{t('invalid-item', { item: t('link') })}
					</Typography>
					<Typography variant="body1" color="text.secondary" mb={3}>
						{t('invalid-email-verification-link-description')}
					</Typography>
					<Button
						component={RouterLink}
						href={FRONT_PATH_NAMES.home}
						variant="text"
						color="primary"
						endIcon={<Iconify icon="eva:arrowhead-right-fill" />}
					>
						{t('go-to-home')}
					</Button>
				</Box>
			);
		}
	}

	throw error;
};
