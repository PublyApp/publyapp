import type { SortingState } from '@tanstack/react-table';
import { JsonParam, NumberParam, useQueryParam, useQueryParams, withDefault } from 'use-query-params';

import { ROWS_PER_PAGE_OPTION } from '@ui-react/components/BestTable';

const useTableQueryParams = () => {
	// storable in the URL
	const [pagination, setPagination] = useQueryParams({
		pageIndex: withDefault(NumberParam, 0),
		pageSize: withDefault(NumberParam, ROWS_PER_PAGE_OPTION[5]),
	});
	const [sorting, setSorting] = useQueryParam<SortingState>('sorting', JsonParam);

	return {
		pagination,
		setPagination,
		sorting,
		setSorting,
	};
};

export default useTableQueryParams;
