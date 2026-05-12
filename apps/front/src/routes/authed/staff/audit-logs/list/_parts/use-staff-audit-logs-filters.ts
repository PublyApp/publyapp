import { parseAsArrayOf, parseAsString, useQueryStates } from 'nuqs';

import type { DateRange } from '#app/components/date-range-filter/index.ts';
import { dayjs } from '#app/utils/format-time.ts';

const parsers = {
	actions: parseAsArrayOf(parseAsString).withDefault([]),
	from: parseAsString,
	to: parseAsString,
};

export const useStaffAuditLogsFilters = (onChange?: () => void) => {
	const [q, setQ] = useQueryStates(parsers);

	const setActions = (next: string[]) => {
		onChange?.();
		setQ({ actions: next });
	};

	const setDateRange = (next: DateRange) => {
		onChange?.();
		setQ({
			from: next.from ? next.from.format('YYYY-MM-DD') : null,
			to: next.to ? next.to.format('YYYY-MM-DD') : null,
		});
	};

	const dateRange: DateRange = {
		from: q.from ? dayjs(q.from) : null,
		to: q.to ? dayjs(q.to) : null,
	};

	return {
		actions: q.actions,
		dateRange,
		setActions,
		setDateRange,
		resetAll: () => setQ({ actions: [], from: null, to: null }),
	};
};
