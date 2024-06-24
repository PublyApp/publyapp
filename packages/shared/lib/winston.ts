import { createLogger, format } from 'winston';
import BrowserConsole from 'winston-transport-browserconsole';

const level = 'debug';

export const createBrowserLogger = () => {
	return createLogger({
		transports: [
			new BrowserConsole({
				format: format.json(),
				level,
			}),
			// Uncomment to compare with default Console transport
			// new winston.transports.Console({
			//     format: winston.format.json(),
			//     level,
			// }),
		],
	});
};
