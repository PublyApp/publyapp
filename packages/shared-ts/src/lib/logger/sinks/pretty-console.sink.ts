import { isServer } from '../../constants';
import type { LogEntry, LogLevel, LogSink } from '../logger.contract';

const COLOR = {
	debug: { ansi: '36', css: 'color:#0891b2' },
	info: { ansi: '32', css: 'color:#16a34a' },
	warn: { ansi: '33', css: 'color:#ca8a04' },
	error: { ansi: '31', css: 'color:#dc2626' },
} as const satisfies Record<LogLevel, { ansi: string; css: string }>;

/** Development, server and browser alike: coloured level, objects expanded. */
export class PrettyConsoleSink implements LogSink {
	write({ level, message, meta }: LogEntry): void {
		const { ansi, css } = COLOR[level];
		const tag = level.toUpperCase().padEnd(5);
		if (isServer) {
			console[level](`\u001B[${ansi}m${tag}\u001B[0m ${message}`);
		} else {
			console[level](`%c${tag}%c ${message}`, css, '');
		}
		if (meta && Object.keys(meta).length > 0) {
			console.dir(meta, { depth: null, colors: isServer });
		}
	}
}
