import type { ILogger } from './logger.types';
import { type LogLevel, logLevelHierarchy } from './logger.utils';

export class ClientLogger implements ILogger {
	logLevel: LogLevel = 'debug';

	info(message: string, ...meta: unknown[]): void {
		if (logLevelHierarchy[this.logLevel] > logLevelHierarchy.info) {
			return;
		}
		console.info(`💡 ${message}`, ...meta);
	}

	warn(message: string, ...meta: unknown[]): void {
		if (logLevelHierarchy[this.logLevel] > logLevelHierarchy.warn) {
			return;
		}
		console.warn(`⚠️ ${message}`, ...meta);
	}

	error(message: string, ...meta: unknown[]): void {
		if (logLevelHierarchy[this.logLevel] > logLevelHierarchy.error) {
			return;
		}
		console.error(`🚨 ${message}`, ...meta);
	}

	debug(message: string, ...meta: unknown[]): void {
		if (logLevelHierarchy[this.logLevel] > logLevelHierarchy.debug) {
			return;
		}
		console.debug(`🐛 ${message}`, ...meta);
	}
}

export const clientLogger = new ClientLogger();
