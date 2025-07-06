import _ from 'lodash';

import dayjs from 'dayjs';
import { nanoid } from 'nanoid';

import { HttpException } from '@/server/exceptions/HttpException';
import {
	DISABLE_SIGNUP_CONFIG_KEY,
	USE_MASTER_KEY,
} from '@/server/lib/constants';
import { env } from '@/server/lib/env';
import {
	expressHandler,
	getRequestIp,
	getRequestUtils,
} from '@/server/lib/express';
import {
	createSessionServer,
	getGlobalConfig,
} from '@/server/lib/parse/parse.utils';
import ParseUser from '@/server/modules/common/auth/user/user.class';
import { defaultHttp } from '@/shared/lib/axios';

import { generateUsername } from 'unique-username-generator';
import { AuthCloudService } from './auth-cloud.service';

export const handlePasswordLogin = expressHandler(async (req, res) => {
	const { password } = req.body;
	const identifier = req.body.email || req.body.username;

	const user = await AuthCloudService.authenticateUserWithPassword({
		usernameOrEmail: identifier,
		password,
	});

	const ipAddress = getRequestIp(req) || nanoid();

	const result = await createSessionServer({
		userId: user.objectId,
		additionalSessionData: {
			ipAddress,
		},
	});

	_.set(user, 'sessionToken', result.sessionToken);

	return res.status(201).json(user);
});

export const handlePasswordSignup = expressHandler(async (req, res) => {
	const { t } = getRequestUtils(req);

	const globalConfig = await getGlobalConfig();
	const disabledSignup: boolean = globalConfig.get(DISABLE_SIGNUP_CONFIG_KEY);

	if (disabledSignup) {
		throw new Error(t('new-signup-disabled'));
	}

	const { email, password, firstName, lastName } = req.body;
	let { username } = req.body;

	if (!email) {
		throw new HttpException(400, 'Email is required');
	}

	if (!username) {
		// username = `${email.split('@')?.[0]}_${nanoid(5)}`;
		username = generateUsername();
	}

	const result = await Parse.User.signUp(
		username,
		password,
		{ email, firstName, lastName },
		USE_MASTER_KEY,
	);

	return res.json(result.toJSON());
});

// export const handleVerifyEmail = expressHandler(async (req, res) => {
// 	const { t } = getRequestUtils(req);
// 	try {
// 		const { token } = req.query;

// 		if (!token || !_.isString(token)) {
// 			throw new HttpException(400, t('item-is-invalid', { item: 'token' }));
// 		}

// 		await AuthCloudService.verifyEmailByToken({ token });

// 		// on success redirect to success page
// 		const successUrl = new URL(env.FRONT_URL);
// 		successUrl.pathname = FRONT_PATH_NAMES.auth.login;
// 		return res.redirect(successUrl.toString());
// 	} catch (error) {
// 		logger.error('Error in verifyEmail:', error);
// 		// on error, redirect to error page
// 		const failUrl = new URL(env.FRONT_URL);
// 		failUrl.pathname = FRONT_PATH_NAMES.auth.signup;
// 		return res.redirect(failUrl.toString());
// 	}
// });

// ! ==================== wip: facebook login flow

const applicationFromURL = {
	office: /* env.OFFICE_URL */ '',
	front: env.FRONT_URL,
} as const;

const getFacebookRedirectURL = (
	applicationFrom?: keyof typeof applicationFromURL,
) => {
	return `${applicationFromURL[applicationFrom || 'office']}/facebook-auth/loading`;
};

// GET: /facebook-auth/dialog-url body: { applicationFrom: 'office' | 'front' }
export const handleGetFacebookLoginDialogURL = expressHandler(
	async (req, res, next) => {
		try {
			const { applicationFrom, isLinkingUser } = req.body;

			const url = new URL('https://www.facebook.com/v19.0/dialog/oauth');
			url.searchParams.append('client_id', process.env.FACEBOOK_APP_ID || '');
			url.searchParams.append(
				'redirect_uri',
				getFacebookRedirectURL(applicationFrom),
			);
			url.searchParams.append(
				'state',
				`"{${isLinkingUser ? 'isLinkingUser=true' : ''}}"`,
			);

			return res.status(200).json({ url: url.toString() });
		} catch (error) {
			return next(error);
		}
	},
);

// GET: /facebook-auth/callback
export const handleFacebookLoginDialogResponse = expressHandler(
	async (req, res) => {
		const { applicationFrom, userId /* , isLinkingUser */ } = req.body;
		const { code, error, error_reason, error_description } = req.query;

		if (error) {
			if (error_reason === 'user_denied') {
				throw new HttpException(403, 'User denied Facebook login');
			}

			throw new HttpException(
				500,
				`Facebook Error: ${error_reason} - ${error_description}`,
			);
		}

		if (!code) {
			throw new HttpException(400, 'No code provided');
		}

		const url = new URL('https://graph.facebook.com/v19.0/oauth/access_token');
		url.searchParams.append('client_id', '');
		url.searchParams.append(
			'redirect_uri',
			getFacebookRedirectURL(applicationFrom),
		);
		url.searchParams.append('client_secret', '');
		url.searchParams.append('code', code.toString());

		const {
			access_token,
			token_type: _token_type,
			expires_in,
		} = await defaultHttp.get<Record<string, unknown>>(url.toString());

		// https://graph.facebook.com/me?fields=id&access_token="xxxxx"
		const meUrl = new URL('https://graph.facebook.com/me');
		meUrl.searchParams.append('fields', 'id');
		meUrl.searchParams.append('access_token', _.toString(access_token));

		const { user_id } = await defaultHttp.get<Record<string, unknown>>(
			url.toString(),
		);

		const expiration_date = dayjs()
			.add(_.toNumber(expires_in), 'second')
			.toISOString();

		const authData = {
			id: user_id,
			access_token,
			expiration_date,
		};

		// the documentation says:
		// Parse then verifies that the provided authData is valid and checks to see if a
		// user is already associated with this data. If so, it returns a status code of 200 OK
		// and the details (including a sessionToken for the user)

		// If the user has never been linked with this account, you will instead receive a
		// status code of 201 Created, indicating that a new user was created:

		// @link https://docs.parseplatform.org/js/guide/#linking-users
		if (userId) {
			const _user = await new Parse.Query(ParseUser)
				.select([])
				.get(userId, USE_MASTER_KEY);

			const user = await _user.linkWith(
				'facebook',
				{ authData },
				USE_MASTER_KEY,
			);

			return res.status(200).json(user.toJSON());
		}

		const user = await Parse.User.logInWith(
			'facebook',
			{ authData },
			USE_MASTER_KEY,
		);

		return res.status(201).json(user.toJSON());
	},
);
