import type winston from 'winston';
import { isServer } from '../constants';
import type { ILogger } from './logger.types';
import { type LogLevel, logLevelHierarchy } from './logger.utils';

let winstonLogger: winston.Logger;
let serverConsoleTransport: typeof winston.transports.Console;

if (isServer) {
	const winston = await import('winston');
	const { consoleFormat } = await import('winston-console-format');
	winstonLogger = winston.createLogger();

	serverConsoleTransport = new winston.transports.Console({
		['name' as never]: 'console',
		level: 'debug',
		format: winston.format.combine(
			winston.format.colorize({ all: true }),
			winston.format.padLevels(),
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
}

export class IsoLogger implements ILogger {
	logLevel: LogLevel = 'debug';

	info(message: string, ...meta: unknown[]): void {
		if (logLevelHierarchy[this.logLevel] > logLevelHierarchy.info) {
			return;
		}
		if (isServer) {
			winstonLogger.info(message, ...meta);
		} else {
			const caller = this.getCallerInfo();
			console.info(`💡 [${caller}] ${message}`, ...meta);
		}
	}

	warn(message: string, ...meta: unknown[]): void {
		if (logLevelHierarchy[this.logLevel] > logLevelHierarchy.warn) {
			return;
		}
		if (isServer) {
			winstonLogger.warn(message, ...meta);
		} else {
			const caller = this.getCallerInfo();
			console.warn(`⚠️ [${caller}] ${message}`, ...meta);
		}
	}

	error(message: string, ...meta: unknown[]): void {
		if (logLevelHierarchy[this.logLevel] > logLevelHierarchy.error) {
			return;
		}
		if (isServer) {
			winstonLogger.error(message, ...meta);
		} else {
			const caller = this.getCallerInfo();
			console.error(`🚨 [${caller}] ${message}`, ...meta);
		}
	}

	debug(message: string, ...meta: unknown[]): void {
		if (logLevelHierarchy[this.logLevel] > logLevelHierarchy.debug) {
			return;
		}
		if (isServer) {
			winstonLogger.debug(message, ...meta);
		} else {
			const caller = this.getCallerInfo();
			console.debug(`🐛 [${caller}] ${message}`, ...meta);
		}
	}

	// Helper method to get the calling location
	private getCallerInfo(): string {
		const stack = new Error().stack;
		if (!stack) return '';

		const lines = stack.split('\n');
		// Skip the first 3 lines: Error, getCallerInfo, and the logger method
		// Look for the first line that's not from this logger file
		for (let i = 3; i < lines.length; i++) {
			const line = lines[i];
			if (
				line &&
				!line.includes('iso-logger.ts') &&
				!line.includes('IsoLogger')
			) {
				// Extract filename and line number
				const match = line.match(/\(([^)]+):(\d+):\d+\)/);
				if (match) {
					const [, filepath, lineNumber] = match;
					const filename = filepath.split('/').pop() || filepath;
					return `${filename}:${lineNumber}`;
				}
			}
		}
		return '';
	}
}

export const isoLogger = new IsoLogger();
