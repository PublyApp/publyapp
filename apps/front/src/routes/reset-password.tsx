import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InvalidLinkView } from '~/components/auth/invalid-link-view';
import { PrecheckUnavailableView } from '~/components/auth/precheck-unavailable-view';
import { redirectAuthenticatedUserAwayFromAuthPage } from '~/lib/auth-route-guard';
import { checkResetPasswordToken } from '~/lib/server/auth-actions';

import { queryParamKey, queryParamValue } from '@org/shared-ts/lib/constants';

import {
	ResetPasswordRequestForm,
	SetNewPasswordForm,
} from './_reset-password-forms';

type ResetPasswordLoaderData =
	| { view: 'invalid' }
	| { view: 'unavailable' }
	| { view: 'request' }
	| {
			view: 'set-new';
			id: string;
			token: string;
			email: string;
			fromEmailVerification: boolean;
	  };

const resetPasswordLoader = async ({
	location,
}: {
	location: { searchStr: string };
}): Promise<ResetPasswordLoaderData> => {
	const params = new URLSearchParams(location.searchStr ?? '');
	const id = params.get(queryParamKey.reset_password_page.encoded_email);
	const token = params.get(queryParamKey.token);

	if (!id || !token) {
		return { view: 'request' };
	}

	const result = await checkResetPasswordToken({ data: { id, token } });
	if (!result.ok) {
		return {
			view: result.reason === 'unavailable' ? 'unavailable' : 'invalid',
		};
	}

	const fromEmailVerification =
		params.get(queryParamKey.reset_password_page.redirect_cause) ===
		queryParamValue.reset_password_page.redirect_cause.email_verification;

	return {
		view: 'set-new',
		id,
		token,
		email: result.email,
		fromEmailVerification,
	};
};

const ResetPasswordRoute = () => {
	const loaderData = useLoaderData({
		from: '/reset-password',
	}) as ResetPasswordLoaderData;
	const { t } = useTranslation(['auth', 'common']);
	// Models only the mid-submit token rejection (`onInvalidToken`) — the
	// loader-derived view below is the source of truth otherwise, so a
	// same-route "Request a new link" navigation (which re-runs the loader
	// but does not remount this component) still reaches the request form
	// instead of getting stuck on "Invalid link" forever (see F3).
	const [tokenRejected, setTokenRejected] = useState(false);

	useEffect(() => {
		setTokenRejected(false);
	}, [loaderData]);

	const view = tokenRejected ? 'invalid' : loaderData.view;

	if (view === 'unavailable') {
		return (
			<PrecheckUnavailableView testId="reset-password-precheck-unavailable-view" />
		);
	}

	if (view === 'invalid') {
		return (
			<InvalidLinkView
				description={t('invalid-reset-link-description')}
				requestNewLinkHref="/reset-password"
				testId="reset-password-invalid-link-view"
			/>
		);
	}

	if (view === 'set-new' && loaderData.view === 'set-new') {
		return (
			<SetNewPasswordForm
				id={loaderData.id}
				token={loaderData.token}
				email={loaderData.email}
				fromEmailVerification={loaderData.fromEmailVerification}
				onInvalidToken={() => setTokenRejected(true)}
			/>
		);
	}

	return <ResetPasswordRequestForm />;
};

export const Route = createFileRoute('/reset-password')({
	beforeLoad: redirectAuthenticatedUserAwayFromAuthPage,
	staticData: { i18nNamespaces: ['auth'], crumbs: 'shell' },
	loader: resetPasswordLoader,
	component: ResetPasswordRoute,
});
