export type LogLevel = (typeof LogLevelEnum)[keyof typeof LogLevelEnum];

export const logLevelHierarchy = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
} as const;

export const LogLevelEnum = {
	DEBUG: 'debug',
	INFO: 'info',
	WARN: 'warn',
	ERROR: 'error',
} as const;
