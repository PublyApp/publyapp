import { toast } from '@/front/components/snackbar';
import { useTranslate } from '@/front/hooks/use-translate';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { queryParamKey, queryParamValue } from '@/shared/lib/constants';
import { sleep } from '@/shared/utils/any.utils';
import { decodeString } from '@/shared/utils/string-encoding.server';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import InvalidLinkView from '../components/invalid-link-view';
import type { Route } from './+types/reset-password-page';

export const loader = getServerLoader({
	loader: async ({ request }) => {
		const searchParams = new URL(request.url).searchParams;
		const token = searchParams.get(queryParamKey.token);
		const encodedEmail = searchParams.get(
			queryParamKey.reset_password_page.encoded_email,
		);

		if (!token || !encodedEmail) {
			return {
				code: 'INVALID_LINK',
			} as const;
		}

		let isValidEncodedEmail = false;
		let decodedEmail = '';

		try {
			decodedEmail = decodeString(encodedEmail);
			isValidEncodedEmail = true;
		} catch (_error) {
			isValidEncodedEmail = false;
		}

		if (!isValidEncodedEmail) {
			return {
				code: 'INVALID_LINK',
			} as const;
		}

		const verifyTokenBelongsToEmail = async (
			_email: string,
			_token: string,
		) => {
			return await sleep(1000, true);
		};

		// verify if token belongs to the email
		const tokenBelongsToEmail = await verifyTokenBelongsToEmail(
			decodedEmail,
			token,
		);

		if (!tokenBelongsToEmail) {
			return {
				code: 'INVALID_LINK',
			} as const;
		}

		return {
			code: 'OK',
		} as const;
	},
});

const ResetPasswordPage = ({ loaderData }: Route.ComponentProps) => {
	const { t } = useTranslate();
	const [searchParams] = useSearchParams();
	const redirect_cause = searchParams.get(
		queryParamKey.login_page.redirect_cause,
	);
	const hasShownToast = useRef(false);

	useEffect(() => {
		if (!hasShownToast.current) {
			if (
				redirect_cause ===
					queryParamValue.reset_password_page.redirect_cause
						.email_verification &&
				loaderData.code === 'OK'
			) {
				toast.success(t('email-verification-success'));
			}

			hasShownToast.current = true;
		}
	}, [redirect_cause, t, loaderData.code]);

	if (loaderData.code === 'INVALID_LINK') {
		return <InvalidLinkView forceIsInvalid />;
	}

	return (
		<div>
			<h1>Reset Password</h1>
		</div>
	);
};

export default ResetPasswordPage;
