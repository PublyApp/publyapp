import fs from 'node:fs';
import path from 'node:path';

import _ from 'lodash';
import _defaults from 'parse-server/lib/defaults.js';

import winston, { format, type Logger } from 'winston';
import { consoleFormat } from 'winston-console-format';
import DailyRotateFile from 'winston-daily-rotate-file';

import duration from '@/shared/utils/duration.utils';

import type { LoggerAdapter } from '../interfaces/LoggerAdapter';

const defaults = _.get(_defaults, 'default') as unknown as typeof _defaults;

const MILLISECONDS_IN_A_DAY = duration.toMilliseconds('1d');

/**
 * @interface Options
 * @property {Logger} logger
 * @property {number | null | undefined} maxLogFiles Maximum number of logs to keep. If not set, no logs will be removed. This can be a number of files or number of days. If using days, add 'd' as the suffix. (default: null)
 */

export default class WinstonLoggerAdapter implements LoggerAdapter {
	readonly logger: Logger;

	maxLogFiles?: number | null | undefined;

	/**
	 * @param {Options} options
	 */
	constructor({
		logger,
		maxLogFiles,
	}: {
		logger: Logger;
		maxLogFiles?: number | null | undefined;
	}) {
		this.logger = logger;
		this.maxLogFiles = maxLogFiles;
		this.configureLogger();
	}

	// biome-ignore lint/suspicious/noExplicitAny: safe to use any here
	log(level: string, message: string, ...meta: any[]) {
		// if (level === 'warn' && message === 'afterSave caught an error') {
		// 	return;
		// }

		// eslint-disable-next-line consistent-return
		return this.logger.log(level, message, ...meta);
	}

	// eslint-disable-next-line class-methods-use-this
	private configureLogger() {
		const { jsonLogs, verbose, silent } = defaults;
		let { logsFolder } = defaults;
		let logLevel = winston.level;
		// const maxLogFiles = 10;

		if (verbose) {
			logLevel = 'verbose';
		}

		winston.level = logLevel;
		const options: Record<string, unknown> = {};

		if (logsFolder) {
			if (!path.isAbsolute(logsFolder)) {
				logsFolder = path.resolve(process.cwd(), logsFolder);
			}

			try {
				fs.mkdirSync(logsFolder);
			} catch (e) {
				/* */
			}
		}

		options.dirname = logsFolder;
		options.level = logLevel;
		options.silent = silent;
		options.maxFiles = this.maxLogFiles;

		if (jsonLogs) {
			options.json = true;
			options.stringify = true;
		}

		this.configureTransports(options);
	}

	// code copied from parse-server source code too
	private configureTransports(options: Record<string, unknown>) {
		const transports = [];

		if (options) {
			const { silent } = options;
			options.silent = undefined;

			try {
				if (!_.isNil(options.dirname)) {
					const parseServer = new DailyRotateFile({
						filename: 'parse-server.info',
						json: true,
						format: format.combine(
							format.timestamp(),
							format.splat(),
							format.json(),
						),
						...options,
					});
					_.set(parseServer, 'name', 'parse-server');
					transports.push(parseServer);

					const parseServerError = new DailyRotateFile({
						filename: 'parse-server.err',
						json: true,
						format: format.combine(
							format.timestamp(),
							format.splat(),
							format.json(),
						),
						...options,
						level: 'error',
					});
					_.set(parseServerError, 'name', 'parse-server-error');
					transports.push(parseServerError);
				}
			} catch (e) {
				/* */
			}

			// * Except for this console transport, the rest of the code is copy pasted from parse-server source code
			const consoleTransport = new winston.transports.Console({
				['name' as never]: 'console',
				silent: silent as never,
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
				...options,
			});

			transports.push(consoleTransport);
		}

		this.removeTransport('console'); // remove default console transport (there will be two stacked console transports otherwise)

		transports.forEach((transport) => {
			this.logger.add(transport);
		});
	}

	private removeTransport(transport: string | winston.transport) {
		const matchingTransport = this.logger.transports.find((t1) => {
			return typeof transport === 'string'
				? _.get(t1, 'name') === transport
				: t1 === transport;
		});

		if (matchingTransport) {
			this.logger.remove(matchingTransport);
		}
	}

	// method copy pasted from parse-server source code just for compatibility purpose
	// custom query as winston is currently limited
	// biome-ignore lint/suspicious/noExplicitAny: safe to use any here
	query(options: any, callback: (...args: any[]) => void = () => {}) {
		if (!options) {
			// biome-ignore lint/style/noParameterAssign: code from parse-server leave as is for now
			options = {};
		}

		// defaults to 7 days prior
		const from =
			options.from || new Date(Date.now() - 7 * MILLISECONDS_IN_A_DAY);
		const until = options.until || new Date();
		const limit = options.size || 10;
		const order = options.order || 'desc';
		const level = options.level || 'info';

		const queryOptions = {
			from,
			until,
			limit,
			order,
		};

		return new Promise((resolve, reject) => {
			// eslint-disable-next-line consistent-return
			this.logger.query(queryOptions as never, (err, res) => {
				if (err) {
					callback(err);
					return reject(err);
				}

				if (level === 'error') {
					callback(res['parse-server-error']);
					resolve(res['parse-server-error']);
				} else {
					callback(res['parse-server']);
					resolve(res['parse-server']);
				}
			});
		});
	}
}
