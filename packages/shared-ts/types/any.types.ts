export type ListMeta = {
	count: number;
	totalCount: number;
	page: number;
	pageSize: number;
	totalPages: number;
};

// oxlint-disable-next-line typescript/no-explicit-any -- safe to use any here
export type WithMeta<T extends Record<string, any>> = T & { meta: ListMeta };
