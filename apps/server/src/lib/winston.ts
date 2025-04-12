import _ from 'lodash';

import winston, { createLogger, format } from 'winston';
import { consoleFormat } from 'winston-console-format';

export const logger = createLogger();

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
				depth: Number.POSITIVE_INFINITY,
				colors: true,
				maxArrayLength: Number.POSITIVE_INFINITY,
				breakLength: 120,
				compact: Number.POSITIVE_INFINITY,
			},
		}),
	),
	// ...options,
});

logger.configure({
	transports: [serverConsoleTransport],
});
