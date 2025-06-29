import { pageToSkip } from '@/server/utils/any.utils';

export type QueryOptions = {
	select?: string[];
	include?: string[];
	exclude?: string[];
};

export const applyQueryOptions = (
	query: Parse.Query,
	options: QueryOptions,
) => {
	if (options.exclude) {
		query.exclude(options.exclude as never);
	}

	if (options.select) {
		query.select(options.select as never);
	}

	if (options.include) {
		query.include(options.include as never);
	}
};

export type LimitAndSkipOptions =
	| {
			type: 'limit';
			limit: number;
			skip: number;
	  }
	| {
			type: 'page';
			page: number;
			pageSize: number;
	  };

export const applySkipAndLimit = (
	query: Parse.Query,
	options: LimitAndSkipOptions,
) => {
	if (options.type === 'limit') {
		query.skip(options.skip).limit(options.limit);
	}

	if (options.type === 'page') {
		const skip = pageToSkip(options.page, options.pageSize);
		query.skip(skip).limit(options.pageSize);
	}
};

export const applyPagination = (
	query: Parse.Query,
	options: {
		page: number;
		size: number;
	},
) => {
	applySkipAndLimit(query, {
		type: 'page',
		page: options.page,
		pageSize: options.size,
	});
};

export const applySorting = (
	query: Parse.Query,
	sorting: { id: string; order: 'asc' | 'desc' }[],
) => {
	for (const element of sorting) {
		if (element.order === 'asc') {
			query.addAscending(element.id as never);
		} else {
			query.addDescending(element.id as never);
		}
	}
};
