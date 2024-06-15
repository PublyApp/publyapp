// import { type Dayjs } from 'dayjs';

export type ListMeta = {
	count: number;
	totalCount: number;
	page: number;
	pageSize: number;
	totalPages: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithMeta<T extends Record<string, any>> = T & { meta: ListMeta };
