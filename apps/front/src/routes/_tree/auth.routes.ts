import { layout, route } from '@react-router/dev/routes';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';
import { getLastPath } from '@org/shared-ts/utils/string.utils';

// Auth routes
export const authRoutes = [
	layout('routes/auth/_layout/auth-layout.tsx', [
		route(
			getLastPath(FRONT_PATH_NAMES.auth.login),
			'routes/auth/login/login-page.tsx',
		),
		route(
			getLastPath(FRONT_PATH_NAMES.auth.signup),
			'routes/auth/signup/sign-up-page.tsx',
		),
		route(
			getLastPath(FRONT_PATH_NAMES.auth.verifyEmail),
			'routes/auth/verify-email/verify-email-page.tsx',
		),
		route(
			getLastPath(FRONT_PATH_NAMES.auth.resetPassword),
			'routes/auth/reset-password/reset-password-page.tsx',
		),
		route(
			getLastPath(FRONT_PATH_NAMES.auth.acceptInvitation),
			'routes/auth/accept-invitation/accept-invitation-page.tsx',
		),
	]),
];
