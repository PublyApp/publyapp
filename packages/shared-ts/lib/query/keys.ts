export type QueryKeySegment =
	| string
	| number
	| boolean
	| null
	| undefined
	| Record<string, unknown>;

type JsonRecord = Record<string, unknown>;

type StringifySeen = Set<object>;

const stringifyQueryArg = (arg: unknown, seen: StringifySeen): string => {
	if (arg === undefined) {
		return 'undefined';
	}

	if (arg === null) {
		return 'null';
	}

	if (
		typeof arg === 'string' ||
		typeof arg === 'number' ||
		typeof arg === 'boolean' ||
		typeof arg === 'bigint'
	) {
		return String(arg);
	}

	if (typeof arg === 'function') {
		return '[function]';
	}

	if (typeof arg === 'symbol') {
		return `[symbol:${arg.description ?? 'anonymous'}]`;
	}

	if (arg instanceof Date) {
		return arg.toISOString();
	}

	if (Array.isArray(arg)) {
		return `[${arg.map((item) => stringifyQueryArg(item, seen)).join(',')}]`;
	}

	if (typeof arg === 'object') {
		if (seen.has(arg)) {
			return '[circular]';
		}

		seen.add(arg);
		try {
			const entries: string[] = [];
			for (const key of Object.keys(arg as JsonRecord).sort()) {
				entries.push(
					`${key}:${stringifyQueryArg((arg as JsonRecord)[key], seen)}`,
				);
			}

			for (const symbolKey of Object.getOwnPropertySymbols(arg as object)) {
				entries.push(
					`${String(symbolKey)}:${stringifyQueryArg((arg as { [key: symbol]: unknown })[symbolKey], seen)}`,
				);
			}

			return `{${entries.join(',')}}`;
		} finally {
			seen.delete(arg);
		}
	}

	return String(arg);
};

export const getQueryKey = (segments: readonly QueryKeySegment[]): string[] => {
	return segments.map((segment) => stringifyQueryArg(segment, new Set<object>()));
};
