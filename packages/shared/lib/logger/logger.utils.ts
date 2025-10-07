import type { LogLevel } from './logger.types';

export const logLevelHierarchy: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};
