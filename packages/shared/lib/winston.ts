import _ from 'lodash';
import winston, { createLogger, format } from 'winston';
import { consoleFormat } from 'winston-console-format';
import browserConsole from 'winston-transport-browserconsole';

import { checkIsServer } from '../utils/env.utils';

// eslint-disable-next-line import/no-mutable-exports
export let logger = createLogger();

export const setLogger = (newLogger: winston.Logger) => {
	logger = newLogger;
};

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

const isServer = checkIsServer();

const BrowserConsole = _.get(browserConsole, 'default') as unknown as typeof browserConsole;

const browserConsolTransport = new BrowserConsole({
	['name' as never]: 'console',
	format: format.json(),
	level: 'debug',
});

// Uncomment to compare with default Console transport
// const browserConsolTransport = new winston.transports.Console({
//     format: winston.format.json(),
//     level,
// }),
if (isServer) {
	logger.configure({
		transports: [serverConsoleTransport],
	});
} else {
	logger.configure({
		transports: [browserConsolTransport],
	});
}
