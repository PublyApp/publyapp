import type { LogEntry, LogSink } from '../logger.contract';
import { nodeProcess } from '../runtime';

/**
 * Production server: one JSON line per event on stdout
 * (`{"time","level","message",...meta}`). Lines are buffered and written in
 * one batch off the caller's stack; `error` entries and process exit flush
 * synchronously so nothing is lost.
 */
export class JsonStdoutSink implements LogSink {
	private lines: string[] = [];
	private scheduled = false;

	constructor(
		private readonly out: (chunk: string) => void = (chunk) =>
			void nodeProcess?.stdout.write(chunk),
		hooks:
			| Pick<NonNullable<typeof nodeProcess>, 'on'>
			| undefined = nodeProcess,
	) {
		hooks?.on('beforeExit', () => this.flush());
		hooks?.on('exit', () => this.flush());
	}

	write({ level, message, meta, time }: LogEntry): void {
		const fields = { time: time.toISOString(), level, message };
		// fields first (stable key order), then meta; fields re-assigned last so meta cannot override them
		this.lines.push(JSON.stringify({ ...fields, ...meta, ...fields }));
		if (level === 'error') {
			this.flush();
		} else if (!this.scheduled) {
			this.scheduled = true;
			queueMicrotask(() => this.flush());
		}
	}

	flush(): void {
		this.scheduled = false;
		if (this.lines.length === 0) {
			return;
		}
		const chunk = `${this.lines.join('\n')}\n`;
		this.lines = [];
		this.out(chunk);
	}
}
