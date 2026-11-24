import {
	type ILogger,
	LOG_LEVELS,
	type LogLevel,
	type LogMeta,
	type LogSink,
} from './logger.contract';
import { redactMeta, redactText } from './redact';

const RANK = Object.fromEntries(
	LOG_LEVELS.map((level, index) => [level, index]),
) as Record<LogLevel, number>;

/**
 * The single core: drops disabled levels first (nothing is built for them),
 * redacts, then hands a plain entry to the sink. Never throws into callers.
 */
export const createLogger = (sink: LogSink, minLevel: LogLevel): ILogger => {
	const isLevelEnabled = (level: LogLevel) => RANK[level] >= RANK[minLevel];
	const emit = (level: LogLevel) => (message: string, meta?: LogMeta) => {
		if (!isLevelEnabled(level)) {
			return;
		}
		try {
			sink.write({
				level,
				message: redactText(message),
				meta: meta && redactMeta(meta),
				time: new Date(),
			});
		} catch {
			// a logger never throws into business code
		}
	};
	return {
		...(Object.fromEntries(LOG_LEVELS.map((l) => [l, emit(l)])) as Pick<
			ILogger,
			LogLevel
		>),
		isLevelEnabled,
	};
};
