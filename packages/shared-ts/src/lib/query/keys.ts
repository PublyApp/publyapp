/**
 * A value that can appear in a query key or in a query/mutation variable bag.
 *
 * `stringifyQueryArg` below is the single serializer for all of them, and this
 * union is the part of its input domain that keeps its identity: primitives,
 * `Date`s (rendered as their ISO string), arrays element-wise, and plain objects
 * key-by-key. A function or a symbol renders as a placeholder marker, so it is
 * deliberately outside the contract. Naming the union here — rather than leaving
 * an open dictionary of `unknown` — is what makes a query key's contract
 * checkable.
 */
export type QueryArgumentValue =
	| string
	| number
	| boolean
	| bigint
	| null
	| undefined
	| Date
	| readonly QueryArgumentValue[]
	| QueryArgumentRecord;

/**
 * A bag of query arguments: query/mutation variables, or an object segment of
 * a query key. Values are {@link QueryArgumentValue}s, so a bag is as
 * checkable as the key it ends up in.
 */
export type QueryArgumentRecord = {
	readonly [key: string]: QueryArgumentValue;
};

/** Object arguments read through a symbol key, mirroring {@link QueryArgumentRecord}. */
type SymbolKeyedArguments = {
	readonly [key: symbol]: QueryArgumentValue;
};

export type QueryKeySegment =
	| string
	| number
	| boolean
	| null
	| undefined
	| QueryArgumentRecord;

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
			// `arg` is a plain object here; reading it as a bag of query
			// arguments is the same contract `getQueryKey` accepts.
			const record = arg as QueryArgumentRecord;
			for (const key of Object.keys(record).sort()) {
				entries.push(`${key}:${stringifyQueryArg(record[key], seen)}`);
			}

			for (const symbolKey of Object.getOwnPropertySymbols(record)) {
				entries.push(
					`${String(symbolKey)}:${stringifyQueryArg((record as SymbolKeyedArguments)[symbolKey], seen)}`,
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
	return segments.map((segment) =>
		stringifyQueryArg(segment, new Set<object>()),
	);
};
