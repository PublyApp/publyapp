import { LOG_LEVELS, type LogLevel } from './logger.contract';

export type LogEnv = {
	NODE_ENV?: string;
	LOG_LEVEL?: string;
	LOG_SINK?: string;
};

export const parseLevel = (raw: string | undefined): LogLevel | undefined =>
	LOG_LEVELS.find((level) => level === raw?.toLowerCase());

/** `LOG_LEVEL` wins; otherwise `info` in production, `debug` elsewhere. */
export const resolveLevel = (env: LogEnv): LogLevel =>
	parseLevel(env.LOG_LEVEL) ??
	(env.NODE_ENV === 'production' ? 'info' : 'debug');
