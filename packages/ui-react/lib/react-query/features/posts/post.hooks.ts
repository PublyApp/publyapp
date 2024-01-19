import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useNavigate } from 'react-router-dom';

import { BO_PATH_NAMES, functionName } from '@/shared/lib/constants';

import {
	createPostAction,
	getPostByIdAction,
	updatePostMutationAction,
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
		queryKey: [getPostByIdSuspenseQueryKeyBase, params],
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
		mutationFn: updatePostMutationAction,
	});

	return { result, key };
};
