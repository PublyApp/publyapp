import { redactEntry } from './log-redaction';
import {
	type ILogger,
	LOG_LEVELS,
	type LogLevel,
	type LogMeta,
} from './logger.types';

const RANK = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
} satisfies Record<LogLevel, number>;

/**
 * The service callers use: drops a disabled level before building anything,
 * redacts once, then writes one plain entry to the adapter.
 */
export class Logger {
	debug!: (message: string, meta?: LogMeta) => void;
	info!: (message: string, meta?: LogMeta) => void;
	warn!: (message: string, meta?: LogMeta) => void;
	error!: (message: string, meta?: LogMeta) => void;

	readonly #adapter: ILogger;
	readonly #minRank: number;

	constructor(adapter: ILogger, minLevel: LogLevel) {
		this.#adapter = adapter;
		this.#minRank = RANK[minLevel];
		for (const level of LOG_LEVELS) {
			this[level] = this.#at(level);
		}
	}

	#at(level: LogLevel) {
		const rank = RANK[level];
		return (message: string, meta?: LogMeta): void => {
			if (rank < this.#minRank) {
				return;
			}
			try {
				this.#adapter.write(
					redactEntry({ level, message, meta, time: new Date() }),
				);
			} catch {
				// a logger never throws into business code
			}
		};
	}
}
