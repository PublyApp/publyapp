import _ from 'lodash';
import winston, { createLogger, format } from 'winston';
import BrowserConsoleImport from 'winston-transport-browserconsole';

import { checkIsServer } from '@devist/shared/utils/env.utils';

const isServer = checkIsServer();

export const logger = createLogger();

const BrowserConsole = isServer
	? (_.get(BrowserConsoleImport, 'default') as unknown as typeof BrowserConsoleImport)
	: BrowserConsoleImport;

const browserConsolTransport = new BrowserConsole({
	['name' as never]: 'console',
	format: format.simple(),
	level: 'debug',
});

if (isServer) {
	import('winston-console-format').then(({ consoleFormat }) => {
		const serverConsoleTransport = new winston.transports.Console({
			['name' as never]: 'console',
			level: 'debug',
			format: format.combine(
				format.colorize({ all: true }),
				format.padLevels(),
				consoleFormat({
					showMeta: true,
					metaStrip: ['timestamp', 'service'],
					inspectOptions: {
						depth: Infinity,
						colors: true,
						maxArrayLength: Infinity,
						breakLength: 120,
						compact: Infinity,
					},
				}),
			),
			// ...options,
		});
		logger.configure({
			transports: [serverConsoleTransport],
		});
	});
} else {
	logger.configure({
		transports: [browserConsolTransport],
	});
}
