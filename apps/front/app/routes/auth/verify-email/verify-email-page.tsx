import { getClientLoader } from '@/front/lib/react-router/client-data';
import { queryParamKey } from '@/shared/lib/constants';
import { data } from 'react-router';
import type { Route } from './+types/verify-email-page';
import { useCheckEmailVerificationToken } from '@/front/lib/react-query/features/auth/auth.hooks';

export const clientLoader = getClientLoader({
	loader: async ({ request, z }) => {
		const t = z.t;
		const url = new URL(request.url);
		const searchParams = url.searchParams;

		const token = searchParams.get(queryParamKey.token);

		if (!token) {
			throw data(
				{
					title: t('invalid-item', { item: t('link') }),
					description: t('invalid-email-verification-link-description'),
				},
				{
					status: 400,
				},
			);
		}

		return data({
			token,
		});
	},
});

const VerifyEmailPage = ({ loaderData }: Route.ComponentProps) => {
	const token = loaderData.token;

	/* const { data } =  */ useCheckEmailVerificationToken({
		variables: { token },
	});

	// if (!token) {
	// 	return (
	// 		<View400
	// 			title="Invalid link"
	// 			description="The verification link you issued is invalid or expired. Contact your administrator to get a new link."
	// 		/>
	// 	);
	// }

	return <div>VerifyEmailPage</div>;
};

export default VerifyEmailPage;
