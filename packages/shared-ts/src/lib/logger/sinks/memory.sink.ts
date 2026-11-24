import type { LogEntry, LogSink } from '../logger.contract';

/** For tests: keeps every entry it receives. */
export class MemorySink implements LogSink {
	readonly entries: LogEntry[] = [];

	write(entry: LogEntry): void {
		this.entries.push(entry);
	}

	clear(): void {
		this.entries.length = 0;
	}
}
