import { DEFAULT_PAGE_SIZE } from '@shared/utils/constants';

export const pageToSkip = (page?: number, pageSize?: number) => {
	return ((page || 1) - 1) * (pageSize || DEFAULT_PAGE_SIZE);
};
