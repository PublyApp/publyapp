// import { keepPreviousData /* useInfiniteQuery, */, useMutation, useQuery } from '@tanstack/react-query';

// import { functionName } from '@devist/shared/lib/constants';

// import {
// 	createAIToolAction,
// 	getAIToolsAction,
// 	// getInfiniteAIToolsAction,
// 	type GetAIToolsQueryParams,
// 	// type GetInfiniteAIToolsQueryParams,
// } from './aiTool.actions';

// export const useGetAITools = (params: GetAIToolsQueryParams) => {
// 	const key = [functionName.getAITools, params] as const;

// 	const result = useQuery({
// 		queryKey: key,
// 		queryFn: getAIToolsAction,
// 		placeholderData: keepPreviousData,
// 	});

// 	return { result, key };
// };

// // type UseGetInfiniteAIToolsProps = {
// // 	pageParam?: { page: number };
// // 	queryParams?: GetInfiniteAIToolsQueryParams;
// // 	// sorting
// // 	// filters
// // };

// // export const useGetInfiniteAITools = (
// // 	props?: UseGetInfiniteAIToolsProps /* = { pageParam: { page: 1 }, queryParams: { pageSize: 6 } } */,
// // ) => {
// // 	const defaultProps: Required<UseGetInfiniteAIToolsProps> = { pageParam: { page: 1 }, queryParams: { pageSize: 6 } };
// // 	const key = [functionName.getAITools, 'Infinite', props?.queryParams ?? defaultProps.queryParams] as const;

// // 	const result = useInfiniteQuery({
// // 		queryKey: key,
// // 		queryFn: getInfiniteAIToolsAction,
// // 		defaultPageParam: { page: 1 },
// // 		getNextPageParam: (lastPage /* , allPages, lastPageParam */) => {
// // 			return { page: lastPage.meta.page + 1 };
// // 		},
// // 	});

// // 	return { key, result };
// // };

// export const useCreateAITool = () => {
// 	const key = [functionName.createAITool] as const;

// 	const result = useMutation({
// 		mutationKey: key,
// 		mutationFn: createAIToolAction,
// 	});

// 	return { result, key };
// };
