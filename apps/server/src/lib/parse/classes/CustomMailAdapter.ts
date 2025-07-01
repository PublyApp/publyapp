import { FRONT_PATH_NAMES } from '@/shared/lib/constants';
import { logger } from '@org/shared/lib/winston.server';

import { encodeString } from '@/shared/utils/string-encoding.server';
import _ from 'lodash';
import { env } from '../../env';
import type { MailAdapter } from '../interfaces/MailAdapter';

type Props = {
	serverUrl: string;
	enableSendVerificationEmail: boolean;
};

export default class CustomMailAdapter implements MailAdapter {
	serverUrl: string;
	enableSendVerificationEmail: boolean;

	constructor({ serverUrl, enableSendVerificationEmail }: Props) {
		this.serverUrl = serverUrl;
		this.enableSendVerificationEmail = enableSendVerificationEmail;
	}

	async sendMail(options: {
		to: string;
		text: string;
		subject: string;
	}): Promise<void> {
		logger.warn('sendMail', options);
	}

	async sendPasswordResetEmail({
		link,
		appName,
		user,
	}: {
		link: string;
		appName: string;
		user: Parse.User;
	}): Promise<void> {
		logger.warn('sendPasswordResetEmail', { link, appName, user });
	}

	async getCustomVerificationLink({
		token,
		email,
	}: {
		token: string;
		email: string;
	}) {
		const url = new URL(this.serverUrl);
		// url.pathname = endPoint.api.auth.verifyEmail; // do not use a server endpoint
		url.pathname = FRONT_PATH_NAMES.auth.verifyEmail; // use a front-end pathname instead
		url.searchParams.set('token', token);

		url.searchParams.set('id', encodeString(_.toString(email)));

		return url.toString();
	}

	async sendVerificationEmail({
		link,
		appName,
		user,
	}: {
		link: string;
		appName: string;
		user: Parse.User;
	}): Promise<void> {
		if (!this.enableSendVerificationEmail) {
			return;
		}

		const verificationUrl = new URL(link);
		const verificationToken = verificationUrl.searchParams.get('token');

		const customLink = this.getCustomVerificationLink({
			token: verificationToken || '',
			email: user.getEmail() || '',
		});

		if (env.LOCAL) {
			logger.warn('sendVerificationEmail', {
				recipient: user.getEmail(),
				subject: `Email Verification Link for ${appName} account`,
				link: customLink,
			});
			return;
		}

		this.sendMail({
			to: user.getEmail() || '',
			text: `
				<h1>Email Verification</h1>
				<p>Please click the link below to verify your email:</p>
				<a href="${customLink}">${customLink}</a>
			`,
			subject: `Email Verification Link for ${appName} account`,
		});
	}
}
