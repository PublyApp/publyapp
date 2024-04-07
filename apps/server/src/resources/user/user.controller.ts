/* eslint-disable @typescript-eslint/naming-convention */
import dayjs from 'dayjs';
import type { RequestHandler } from 'express';
import _ from 'lodash';
import { nanoid } from 'nanoid';

import { HttpException } from '@/server/exceptions/HttpException';
import { USE_MASTER_KEY } from '@/server/lib/constants';
import { env } from '@/server/lib/env';
import ParseUser from '@/server/lib/parse/classes/user.class';
import { createSessionServer } from '@/server/lib/parse/utils';
import { getRequestIp } from '@/server/utils/request.utils';
import { defaultHttp } from '@/shared/lib/axios';

import { AuthCloudService } from '../auth/auth.cloud.service';

export const handlePasswordLogin: RequestHandler = async (req, res, next) => {
	try {
		const { username, password } = req.body;

		const user = await AuthCloudService.authenticateUserWithPassword({ usernameOrEmail: username, password });

		const ipAddress = getRequestIp(req) || nanoid();

		const result = await createSessionServer({
			userId: user.objectId,
			additionalSessionData: {
				ipAddress,
			},
		});

		_.set(user, 'sessionToken', result.sessionToken);

		return res.json(user);
	} catch (error) {
		return next(error);
	}
};

// ! wip: facebook login flow

const applicationFromURL = {
	office: env.OFFICE_URL,
	front: env.FRONT_URL,
} as const;

const getFacebookRedirectURL = (applicationFrom?: keyof typeof applicationFromURL) => {
	return `${applicationFromURL[applicationFrom || 'office']}/facebook-auth/loading`;
};

// GET: /facebook-auth/dialog-url body: { applicationFrom: 'office' | 'front' }
export const handleGetFacebookLoginDialogURL: RequestHandler = async (req, res, next) => {
	try {
		const { applicationFrom, isLinkingUser } = req.body;

		const url = new URL('https://www.facebook.com/v19.0/dialog/oauth');
		// eslint-disable-next-line turbo/no-undeclared-env-vars
		url.searchParams.append('client_id', process.env.FACEBOOK_APP_ID || '');
		// eslint-disable-next-line turbo/no-undeclared-env-vars
		url.searchParams.append('redirect_uri', getFacebookRedirectURL(applicationFrom));
		// eslint-disable-next-line turbo/no-undeclared-env-vars
		url.searchParams.append('state', `"{${isLinkingUser ? 'isLinkingUser=true' : ''}}"`);

		return res.status(200).json({ url: url.toString() });
	} catch (error) {
		return next(error);
	}
};

// GET: /facebook-auth/callback
export const handleFacebookLoginDialogResponse: RequestHandler = async (req, res, next) => {
	try {
		const { applicationFrom, userId /* , isLinkingUser */ } = req.body;
		const { code, error, error_reason, error_description } = req.query;

		if (error) {
			if (error_reason === 'user_denied') {
				throw new HttpException(403, 'User denied Facebook login');
			}

			throw new HttpException(500, `Facebook Error: ${error_reason} - ${error_description}`);
		}

		if (!code) {
			throw new HttpException(400, 'No code provided');
		}

		const url = new URL('https://graph.facebook.com/v19.0/oauth/access_token');
		url.searchParams.append('client_id', '');
		url.searchParams.append('redirect_uri', getFacebookRedirectURL(applicationFrom));
		url.searchParams.append('client_secret', '');
		url.searchParams.append('code', code.toString());

		const {
			access_token,
			token_type: _token_type,
			expires_in,
		} = await defaultHttp.get<Record<string, any>>(url.toString());

		// https://graph.facebook.com/me?fields=id&access_token="xxxxx"
		const meUrl = new URL('https://graph.facebook.com/me');
		meUrl.searchParams.append('fields', 'id');
		meUrl.searchParams.append('access_token', access_token);

		const { user_id } = await defaultHttp.get<Record<string, any>>(url.toString());

		const expiration_date = dayjs().add(expires_in, 'second').toISOString();

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
			const _user = await new Parse.Query(ParseUser).select([]).get(userId, USE_MASTER_KEY);

			const user = await _user.linkWith('facebook', { authData }, USE_MASTER_KEY);

			return res.status(200).json(user.toJSON());
		}

		const user = await Parse.User.logInWith('facebook', { authData }, USE_MASTER_KEY);

		return res.status(201).json(user.toJSON());
	} catch (error) {
		return next(error);
	}
};
