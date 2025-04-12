import { pageToSkip } from "@/server/utils/any.utils";

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
			type: "limit";
			limit: number;
			skip: number;
	  }
	| {
			type: "page";
			page: number;
			pageSize: number;
	  };

export const applySkipAndLimit = (
	query: Parse.Query,
	options: LimitAndSkipOptions,
) => {
	if (options.type === "limit") {
		query.skip(options.skip).limit(options.limit);
	}

	if (options.type === "page") {
		const skip = pageToSkip(options.page);
		query.skip(skip).limit(options.pageSize);
	}
};

export const applySorting = (
	query: Parse.Query,
	sorting: { id: string; desc: boolean }[],
) => {
	for (const element of sorting) {
		if (element.desc) {
			query.addDescending(element.id as never);
		} else {
			query.addAscending(element.id as never);
		}
	}
};
