import winston, { createLogger, format } from 'winston';
import { consoleFormat } from 'winston-console-format';
import type { ILogger, LogLevel } from './logger.types';
import { logLevelHierarchy } from './logger.utils';

const winstonLogger = createLogger();

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

winstonLogger.configure({
	transports: [serverConsoleTransport],
});

export class ServerLogger implements ILogger {
	logLevel: LogLevel = 'debug';

	info(message: string, ...meta: unknown[]): void {
		if (logLevelHierarchy[this.logLevel] > logLevelHierarchy.info) {
			return;
		}
		winstonLogger.info(message, ...meta);
	}

	warn(message: string, ...meta: unknown[]): void {
		if (logLevelHierarchy[this.logLevel] > logLevelHierarchy.warn) {
			return;
		}
		winstonLogger.warn(message, ...meta);
	}

	error(message: string, ...meta: unknown[]): void {
		if (logLevelHierarchy[this.logLevel] > logLevelHierarchy.error) {
			return;
		}
		winstonLogger.error(message, ...meta);
	}

	debug(message: string, ...meta: unknown[]): void {
		if (logLevelHierarchy[this.logLevel] > logLevelHierarchy.debug) {
			return;
		}
		winstonLogger.debug(message, ...meta);
	}
}

export const serverLogger = new ServerLogger();
