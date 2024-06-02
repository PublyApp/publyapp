/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable class-methods-use-this */
import logger from '../../logger';
import type MailAdapter from '../interfaces/MailAdapter';

export default class CustomMailAdapter implements MailAdapter {
	async sendMail(options: { to: string; text: string; subject: string }): Promise<void> {
		logger.warn('sendMail', options);
	}

	async sendPasswordResetEmail({ link, appName, user }: { link: string; appName: string; user: any }): Promise<void> {
		logger.warn('sendPasswordResetEmail', { link, appName, user });
	}

	async sendVerificationEmail({ link, appName, user }: { link: string; appName: string; user: any }): Promise<void> {
		logger.warn('sendVerificationEmail', { link, appName, user });
	}
}
