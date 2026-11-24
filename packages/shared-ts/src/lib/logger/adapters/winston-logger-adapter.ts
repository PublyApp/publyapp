import winston from 'winston';
import { consoleFormat } from 'winston-console-format';
import BrowserConsole from 'winston-transport-browserconsole';

import type { ILogger, LogEntry, LogValue } from '../logger.types';

type WinstonLike = {
	log(entry: Record<string, LogValue>): void;
};

/** Development, server and browser: the level is already filtered upstream. */
export class WinstonLoggerAdapter implements ILogger {
	readonly #winston: WinstonLike;

	constructor(winstonLogger: WinstonLike) {
		this.#winston = winstonLogger;
	}

	write({ level, message, meta, time }: LogEntry): void {
		this.#winston.log({
			...meta,
			level,
			message,
			timestamp: time.toISOString(),
		});
	}
}

const createWinston = (transports: winston.transport[]) =>
	winston.createLogger({ level: 'debug', transports });

/** Server development: coloured, padded levels, meta expanded by util.inspect. */
export const createServerWinstonAdapter = (): WinstonLoggerAdapter =>
	new WinstonLoggerAdapter(
		createWinston([
			new winston.transports.Console({
				format: winston.format.combine(
					winston.format.colorize({ all: true }),
					winston.format.padLevels(),
					consoleFormat({
						showMeta: true,
						metaStrip: ['timestamp'],
						inspectOptions: { depth: null, colors: true, breakLength: 120 },
					}),
				),
			}),
		]),
	);

/** Browser development: Winston's console transport for the same rendering. */
export const createBrowserWinstonAdapter = (): WinstonLoggerAdapter =>
	new WinstonLoggerAdapter(
		createWinston([
			new BrowserConsole({
				format: winston.format.combine(
					winston.format.colorize({ all: true }),
					winston.format.padLevels(),
					winston.format.simple(),
				),
			}),
		]),
	);
