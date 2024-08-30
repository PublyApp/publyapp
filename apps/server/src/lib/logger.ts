import { getLogger } from 'parse-server/lib/logger.js';

import { createLogger, format, transports } from 'winston';
import { consoleFormat } from 'winston-console-format';

export const consoleTransport = new transports.Console({
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
});

const logger = getLogger();
export default logger;

export const seedingLogger = createLogger({ transports: [consoleTransport] });

// TODO: test again later
// export const createSillyLogger = (appId: string) => {
// 	const options = {
// 		logsFolder: defaults.logsFolder,
// 		jsonLogs: defaults.jsonLogs,
// 		verbose: defaults.verbose,
// 		silent: defaults.silent,
// 		logLevel: 'silly',
// 	};
// 	const adapter = new WinstonLoggerAdapter(options);
// 	return new LoggerController(adapter, appId, options);
// };
