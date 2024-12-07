/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable class-methods-use-this */
import { endPoint } from '@/shared/lib/constants';
import { logger } from '@/shared/lib/winston';

import type MailAdapter from '../interfaces/MailAdapter';

type Props = {
	serverUrl: string;
};

export default class CustomMailAdapter implements MailAdapter {
	serverUrl: string;

	constructor({ serverUrl }: Props) {
		this.serverUrl = serverUrl;
	}

	async sendMail(options: { to: string; text: string; subject: string }): Promise<void> {
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

	getCustomVerificationLink({ token, username }: { token: string; username: string }) {
		const url = new URL(this.serverUrl);
		url.pathname = endPoint.api.auth.verifyEmail;
		url.searchParams.set('token', token);
		url.searchParams.set('username', username);

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
		// logger.warn('sendVerificationEmail', { link, appName, user });

		const verificationUrl = new URL(link);
		const verificationToken = verificationUrl.searchParams.get('token');
		const username = verificationUrl.searchParams.get('username');

		const customLink = this.getCustomVerificationLink({
			token: verificationToken || '',
			username: username || '',
		});

		if (global.LOCAL) {
			logger.warn('sendVerificationEmail', {
				recipient: user.getEmail(),
				subject: `Email Verification Link for ${appName} account`,
				link: customLink,
			});
			// return;
		}

		// this._sendMail()
	}
}
