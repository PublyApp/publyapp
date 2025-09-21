import { logger } from '@org/shared/lib/winston.server';
import { AuthCloudService } from '@/server/modules/common/auth/auth-cloud.service';
import { env } from '../../env';
import type { MailAdapter } from '../interfaces/MailAdapter';

type Props = {
	serverUrl: string;
	enableSendVerificationEmail: boolean;
};

export default class ParseMailAdapter implements MailAdapter {
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

		const customLink = await AuthCloudService.getCustomVerificationLink({
			token: verificationToken || '',
			email: user.getEmail() || '',
			serverUrl: this.serverUrl,
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
			subject: `Email Verification Link for ${appName} account`,
			text: `<h1>Email Verification</h1>
<p>Please click the link below to verify your email:</p>
<a href="${customLink}">${customLink}</a>`,
		});
	}
}
