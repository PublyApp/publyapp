export type ListMeta = {
	count: number;
	totalCount: number;
	page: number;
	pageSize: number;
	totalPages: number;
};

export type WithMeta<T extends Record<string, any>> = T & { meta: ListMeta };
