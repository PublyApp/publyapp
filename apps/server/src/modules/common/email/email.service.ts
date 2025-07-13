import { logger } from '@/shared/lib/winston.server';

export default class EmailService {
	async sendEmail(options: {
		to: string;
		subject: string;
		html: string;
	}): Promise<void> {
		logger.debug('➡️ sendEmail', options);
	}
}
