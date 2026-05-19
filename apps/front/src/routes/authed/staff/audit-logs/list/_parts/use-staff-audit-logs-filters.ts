import { parseAsArrayOf, parseAsString, useQueryStates } from 'nuqs';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { DateRange } from '#app/components/date-range-filter/date-range-filter.types.ts';
import { dayjs, type Dayjs } from '#app/utils/format-time.ts';

const DATE_QUERY_FORMAT = 'YYYY-MM-DD';
const DATE_QUERY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const parsers = {
	actions: parseAsArrayOf(parseAsString).withDefault([]),
	from: parseAsString,
	to: parseAsString,
};

const parseDateQueryValue = (
	value: string | null,
	boundary: 'from' | 'to',
): Dayjs | null => {
	if (!value || !DATE_QUERY_PATTERN.test(value)) {
		return null;
	}

	const parsed = dayjs(value);
	if (!parsed.isValid() || parsed.format(DATE_QUERY_FORMAT) !== value) {
		return null;
	}

	return boundary === 'from' ? parsed.startOf('day') : parsed.endOf('day');
};

const toDateQueryValue = (value: Dayjs | null): string | null => {
	return value ? value.format(DATE_QUERY_FORMAT) : null;
};

const buildFilterSignature = (
	actions: string[],
	from: string | null,
	to: string | null,
): string => {
	// Use non-printable separators so dotted action values
	// and date strings cannot collide when comparing filter
	// state.
	return [actions.join('\u001F'), from ?? '', to ?? ''].join('\u001E');
};

export const useStaffAuditLogsFilters = (onChange?: () => void) => {
	const [q, setQ] = useQueryStates(parsers);

	const from = useMemo(() => parseDateQueryValue(q.from, 'from'), [q.from]);
	const to = useMemo(() => parseDateQueryValue(q.to, 'to'), [q.to]);
	const normalizedFrom = toDateQueryValue(from);
	const normalizedTo = toDateQueryValue(to);
	const filterSignature = useMemo(
		() => buildFilterSignature(q.actions, normalizedFrom, normalizedTo),
		[q.actions, normalizedFrom, normalizedTo],
	);
	// Setters call onChange before updating the URL. This ref
	// prevents the URL-sync effect from resetting pagination a
	// second time, while still catching browser back/forward edits.
	const previousFilterSignatureRef = useRef(filterSignature);

	useEffect(() => {
		const shouldClearFrom = q.from !== null && normalizedFrom === null;
		const shouldClearTo = q.to !== null && normalizedTo === null;

		if (!shouldClearFrom && !shouldClearTo) {
			return;
		}

		const nextQueryState: { from?: null; to?: null } = {};
		if (shouldClearFrom) {
			nextQueryState.from = null;
		}
		if (shouldClearTo) {
			nextQueryState.to = null;
		}

		void setQ(nextQueryState);
	}, [q.from, q.to, normalizedFrom, normalizedTo, setQ]);

	useEffect(() => {
		if (previousFilterSignatureRef.current === filterSignature) {
			return;
		}

		previousFilterSignatureRef.current = filterSignature;
		onChange?.();
	}, [filterSignature, onChange]);

	const setActions = useCallback(
		(next: string[]) => {
			previousFilterSignatureRef.current = buildFilterSignature(
				next,
				normalizedFrom,
				normalizedTo,
			);
			onChange?.();
			void setQ({ actions: next });
		},
		[normalizedFrom, normalizedTo, onChange, setQ],
	);

	const setDateRange = useCallback(
		(next: DateRange) => {
			const nextFrom = toDateQueryValue(next.from);
			const nextTo = toDateQueryValue(next.to);
			previousFilterSignatureRef.current = buildFilterSignature(
				q.actions,
				nextFrom,
				nextTo,
			);
			onChange?.();
			void setQ({
				from: nextFrom,
				to: nextTo,
			});
		},
		[onChange, q.actions, setQ],
	);

	const resetAll = useCallback(() => {
		previousFilterSignatureRef.current = buildFilterSignature([], null, null);
		onChange?.();
		void setQ({ actions: [], from: null, to: null });
	}, [onChange, setQ]);

	const dateRange = useMemo<DateRange>(() => ({ from, to }), [from, to]);

	return {
		actions: q.actions,
		dateRange,
		filterSignature,
		setActions,
		setDateRange,
		resetAll,
	};
};
