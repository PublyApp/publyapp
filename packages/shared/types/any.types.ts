export type ListMeta = {
	count: number;
	totalCount: number;
	page: number;
	pageSize: number;
	totalPages: number;
};

// biome-ignore lint/suspicious/noExplicitAny: safe to use any here
export type WithMeta<T extends Record<string, any>> = T & { meta: ListMeta };
