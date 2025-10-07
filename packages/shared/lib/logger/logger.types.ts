export interface ILogger {
	log(message: string, level: 'info' | 'warn' | 'error' | 'debug'): void;
	info(message: string): void;
	warn(message: string): void;
	error(message: string): void;
	debug(message: string): void;
}
