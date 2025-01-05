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
