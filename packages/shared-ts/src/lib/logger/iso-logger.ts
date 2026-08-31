import type winston from 'winston';

import { isServer } from '../constants.ts';
import type { ILogger } from './logger.types';
import { type LogLevel, logLevelHierarchy } from './logger.utils.ts';

let winstonLogger: winston.Logger;
let serverConsoleTransport: typeof winston.transports.Console;

if (isServer) {
	const winston = await import('winston');
	const { consoleFormat } = await import('winston-console-format');
	winstonLogger = winston.createLogger();

	serverConsoleTransport = new winston.transports.Console({
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

	winstonLogger?.configure({
		transports: [serverConsoleTransport],
	});
}

// Browser console formatter similar to winston-console-format
interface BrowserConsoleFormatOptions {
	showMeta?: boolean;
	metaStrip?: string[];
	depth?: number;
	maxArrayLength?: number;
}

class BrowserConsoleFormatter {
	private options: Required<BrowserConsoleFormatOptions>;

	constructor(options: BrowserConsoleFormatOptions = {}) {
		this.options = {
			showMeta: options.showMeta ?? true,
			metaStrip: options.metaStrip ?? [],
			depth: options.depth ?? Number.POSITIVE_INFINITY,
			maxArrayLength: options.maxArrayLength ?? Number.POSITIVE_INFINITY,
		};
	}

	private getLevelStyles(level: string): { badge: string; text: string } {
		const styles = {
			debug: {
				badge:
					'background: #6c757d; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold; font-size: 11px;',
				text: 'color: #6c757d; font-weight: normal;',
			},
			info: {
				badge:
					'background: #0dcaf0; color: black; padding: 2px 6px; border-radius: 3px; font-weight: bold; font-size: 11px;',
				text: 'color: #0dcaf0; font-weight: normal;',
			},
			warn: {
				badge:
					'background: #ffc107; color: black; padding: 2px 6px; border-radius: 3px; font-weight: bold; font-size: 11px;',
				text: 'color: #ffc107; font-weight: normal;',
			},
			error: {
				badge:
					'background: #dc3545; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold; font-size: 11px;',
				text: 'color: #dc3545; font-weight: normal;',
			},
		};
		return styles[level as keyof typeof styles] || styles.info;
	}

	private formatMeta(meta: unknown[]): unknown[] {
		if (!this.options.showMeta || meta.length === 0) {
			return [];
		}

		// Filter out stripped properties if meta is an object
		const filteredMeta = meta.map((item) => {
			if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
				const filtered = { ...item };
				for (const key of this.options.metaStrip) {
					delete filtered[key as keyof typeof filtered];
				}
				return filtered;
			}
			return item;
		});

		return filteredMeta;
	}

	private formatMessage(
		level: string,
		caller: string,
		message: string,
	): string {
		const levelUpper = level.toUpperCase().padEnd(5);
		return `%c${levelUpper}%c [${caller}] ${message}`;
	}

	format(
		level: string,
		caller: string,
		message: string,
		...meta: unknown[]
	): void {
		const styles = this.getLevelStyles(level);
		const formattedMessage = this.formatMessage(level, caller, message);
		const formattedMeta = this.formatMeta(meta);

		// Use appropriate console method
		let consoleMethod: typeof console.info = console.info;
		if (level === 'error') {
			consoleMethod = console.error;
		} else if (level === 'warn') {
			consoleMethod = console.warn;
		} else if (level === 'debug') {
			consoleMethod = console.debug;
		}

		// If we have meta objects, use console.group for better formatting
		if (
			formattedMeta.some((item) => typeof item === 'object' && item !== null)
		) {
			console.group(formattedMessage, styles.badge, styles.text);

			// Log each meta item with proper formatting
			for (const item of formattedMeta) {
				if (typeof item === 'object' && item !== null) {
					console.dir(item, {
						depth: this.options.depth,
						maxArrayLength: this.options.maxArrayLength,
						colors: true,
					});
				} else {
					consoleMethod(item);
				}
			}

			console.groupEnd();
		} else {
			// Simple log without grouping
			consoleMethod(
				formattedMessage,
				styles.badge,
				styles.text,
				...formattedMeta,
			);
		}
	}
}

// Create browser formatter instance
let browserFormatter: BrowserConsoleFormatter;

if (!isServer) {
	browserFormatter = new BrowserConsoleFormatter({
		showMeta: true,
		metaStrip: ['timestamp', 'service'],
		depth: Number.POSITIVE_INFINITY,
		maxArrayLength: Number.POSITIVE_INFINITY,
	});
}

export class IsoLogger implements ILogger {
	logLevel: LogLevel = 'debug';

	info(message: string, ...meta: unknown[]): void {
		if (logLevelHierarchy[this.logLevel] > logLevelHierarchy.info) {
			return;
		}
		const caller = this.getCallerInfo();
		if (isServer) {
			winstonLogger?.info(`[${caller}] ${message}`, ...meta);
		} else {
			browserFormatter?.format('info', caller, message, ...meta);
		}
	}

	warn(message: string, ...meta: unknown[]): void {
		if (logLevelHierarchy[this.logLevel] > logLevelHierarchy.warn) {
			return;
		}
		const caller = this.getCallerInfo();
		if (isServer) {
			winstonLogger?.warn(`[${caller}] ${message}`, ...meta);
		} else {
			browserFormatter?.format('warn', caller, message, ...meta);
		}
	}

	error(message: string, ...meta: unknown[]): void {
		if (logLevelHierarchy[this.logLevel] > logLevelHierarchy.error) {
			return;
		}
		const caller = this.getCallerInfo();
		if (isServer) {
			winstonLogger?.error(`[${caller}] ${message}`, ...meta);
		} else {
			browserFormatter?.format('error', caller, message, ...meta);
		}
	}

	debug(message: string, ...meta: unknown[]): void {
		if (logLevelHierarchy[this.logLevel] > logLevelHierarchy.debug) {
			return;
		}
		const caller = this.getCallerInfo();
		if (isServer) {
			winstonLogger?.debug(`[${caller}] ${message}`, ...meta);
		} else {
			browserFormatter?.format('debug', caller, message, ...meta);
		}
	}

	// Helper method to get the calling location
	private getCallerInfo(): string {
		const stack = new Error().stack;
		if (!stack) {
			return '';
		}

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
				// Try multiple patterns to handle different browser stack trace formats:
				// 1. Chrome/Edge with function name: "at functionName (file:line:col)"
				// 2. Chrome/Edge without function name: "at file:line:col"
				// 3. Firefox: "functionName@file:line:col"
				const patterns = [
					/\(([^)]+):(\d+):\d+\)/, // Pattern 1: with parentheses
					/at\s+(.+):(\d+):\d+/, // Pattern 2: without parentheses
					/@(.+):(\d+):\d+/, // Pattern 3: Firefox format
				];

				for (const pattern of patterns) {
					const match = line.match(pattern);
					if (match) {
						const [, filepath, lineNumber] = match;
						// Extract just the filename from the full path or URL
						const filename =
							filepath.split('/').pop()?.split('?')[0] || filepath;
						return `${filename}:${lineNumber}`;
					}
				}
			}
		}
		return '';
	}
}

export const logger = new IsoLogger();
