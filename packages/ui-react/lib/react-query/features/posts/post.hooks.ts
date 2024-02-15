import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useNavigate } from 'react-router-dom';

import { BO_PATH_NAMES, functionName } from '@/shared/lib/constants';

import {
	createPostAction,
	findPostAction,
	getPostByIdAction,
	updatePostAction,
	type GetPostByIdQueryParams,
} from './post.actions';

// ---- 1 --------------------------------------------------------------------------------

export const createPostMutationKeyBase = functionName.createPost;

export const useCreatePostMutation = () => {
	const { enqueueSnackbar } = useSnackbar();
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const key = [createPostMutationKeyBase] as const;

	const result = useMutation({
		mutationKey: key,
		mutationFn: createPostAction,
		onSuccess: async (data /* , variables, context */) => {
			enqueueSnackbar({ variant: 'success', message: 'New post created' });
			queryClient.setQueryData([functionName.getPost, { id: data.objectId }], data);
			navigate(BO_PATH_NAMES.dashboard.posts.edit(data.objectId));
		},
		onError: async (error /* , variables, context */) => {
			let message = 'Unknown error';

			if (error instanceof Error) {
				message = error.message;
			}

			enqueueSnackbar({ variant: 'error', message });
		},
	});

	return {
		result,
		key,
	};
};

// ---- 2 --------------------------------------------------------------------------------

// type UseGetPostByIdSuspenseQueryProps = {
// 	params: GetPostByIdQueryParams;
// 	options?: Omit<
// 		UseSuspenseQueryOptions<
// 			GetPostByIdActionResult,
// 			Error,
// 			GetPostByIdActionResult,
// 			readonly ['getPost', GetPostByIdFunctionParams]
// 		>,
// 		'queryKey' | 'queryFn'
// 	>;
// };

export const getPostByIdSuspenseQueryKeyBase = functionName.getPost;

export const getPostByIdQuery = (params: GetPostByIdQueryParams) => {
	return queryOptions({
		queryKey: [getPostByIdSuspenseQueryKeyBase, params] as const,
		queryFn: getPostByIdAction,
	});
};

type UseGetPostByIdSuspenseQueryProps = {
	params: GetPostByIdQueryParams;
	options?: Omit<ReturnType<typeof getPostByIdQuery>, 'queryKey' | 'queryFn'>;
};

export const useGetPostByIdSuspenseQuery = (props: UseGetPostByIdSuspenseQueryProps) => {
	const query = getPostByIdQuery(props.params);

	const result = useSuspenseQuery({
		...query,
		...props.options,
	});

	return {
		key: query.queryKey,
		result,
	};
};

// export const useGetPostByIdSuspenseQuery = (props: UseGetPostByIdSuspenseQueryProps) => {
// 	const key = [functionName.getPost, props.params] as const;

// 	const result = useSuspenseQuery({
// 		queryKey: key,
// 		queryFn: getPostByIdAction,
// 		...props.options,
// 	});

// 	return {
// 		key,
// 		result,
// 	};
// };

// ---- 3 --------------------------------------------------------------------------------

export const useUpdatePostMutation = () => {
	const key = [functionName.updatePost] as const;

	const result = useMutation({
		mutationKey: key,
		mutationFn: updatePostAction,
	});

	return { result, key };
};

// ---- 4 --------------------------------------------------------------------------------

export const findPostQueryKeyBase = functionName.findPost;

export type FindPostQueryParams = {};

export const findPostQuery = (params: FindPostQueryParams) => {
	return queryOptions({
		queryKey: [getPostByIdSuspenseQueryKeyBase, params] as const,
		queryFn: findPostAction,
	});
};

type UseFindPostSuspenseQueryProps = {
	params: FindPostQueryParams;
	options?: Omit<ReturnType<typeof findPostQuery>, 'queryKey' | 'queryFn'>;
};

export const useFindPostSuspenseQuery = (props: UseFindPostSuspenseQueryProps) => {
	const query = findPostQuery(props.params);

	const result = useSuspenseQuery({
		...query,
		...props.options,
	});

	return {
		key: query.queryKey,
		result,
	};
};

export const useFindPostQuery = (props: UseFindPostSuspenseQueryProps) => {
	const query = findPostQuery(props.params);

	const result = useQuery({
		...query,
		...props.options,
	});

	return {
		key: query.queryKey,
		result,
	};
};
