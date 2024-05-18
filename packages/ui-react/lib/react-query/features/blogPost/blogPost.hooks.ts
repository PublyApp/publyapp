import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
	type UseMutationOptions,
} from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useNavigate } from 'react-router-dom';

import { BO_PATH_NAMES } from '@/shared/lib/constants';
import useTranslate from '@/ui-react/hooks/useTranslate';

import {
	createPostAction,
	createPostMutationKeyBase,
	findPostBoTableQuery,
	getPostBoEditFormQuery,
	updatePostAction,
	updatePostMutationKeyBase,
	type FindPostBoTableQueryParams,
	type GetPostBoEditFormQueryParams,
	// type FindPostQueryParams,
	// type GetPostByIdQueryParams,
} from './blogPost.actions';

// ---- 1 --------------------------------------------------------------------------------

export const useCreatePostMutation = () => {
	const { enqueueSnackbar } = useSnackbar();
	const navigate = useNavigate();
	// const queryClient = useQueryClient();

	const key = [createPostMutationKeyBase] as const;

	const result = useMutation({
		mutationKey: key,
		mutationFn: createPostAction,
		onSuccess: async (data /* , variables, context */) => {
			enqueueSnackbar({ variant: 'success', message: 'New post created' });
			// queryClient.setQueryData([getPostQueryKeyBase, { id: data.objectId }], data);
			// queryClient.invalidateQueries({ queryKey: [findPostQueryKeyBase] });
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

type UseGetPostByIdSuspenseQueryProps = {
	params: GetPostBoEditFormQueryParams;
	options?: Omit<ReturnType<typeof getPostBoEditFormQuery>, 'queryKey' | 'queryFn'>;
};

export const useGetPostByIdSuspenseQuery = (props: UseGetPostByIdSuspenseQueryProps) => {
	const query = getPostBoEditFormQuery(props.params);

	const result = useSuspenseQuery({
		...query,
		...props.options,
	});

	return {
		key: query.queryKey,
		result,
	};
};

// ---- 3 --------------------------------------------------------------------------------

type UseFindPostQueryProps = {
	params: Omit<FindPostBoTableQueryParams, 'locale'>;
	options?: Omit<ReturnType<typeof findPostBoTableQuery>, 'queryKey' | 'queryFn'>;
};

export const useFindPostBoTableSuspenseQuery = (props: UseFindPostQueryProps) => {
	const { locale } = useTranslate();

	const query = findPostBoTableQuery({ ...props.params, locale });

	const result = useSuspenseQuery({
		...query,
		...props.options,
	});

	return {
		key: query.queryKey,
		result,
	};
};

export const useFindPostBoTableQuery = (props: UseFindPostQueryProps) => {
	const { locale } = useTranslate();

	const query = findPostBoTableQuery({ ...props.params, locale });

	const result = useQuery({
		...query,
		...props.options,
	});

	return {
		key: query.queryKey,
		result,
	};
};

// ---- 4 --------------------------------------------------------------------------------
type UseUpdatePostMutationProps = Omit<
	UseMutationOptions<Awaited<ReturnType<typeof updatePostAction>>, Error, Parameters<typeof updatePostAction>[0]>,
	'mutationKey' | 'mutationFn'
>;

export const useUpdatePostMutation = (props: UseUpdatePostMutationProps = {}) => {
	const { onError, onSuccess, ...otherProps } = props;
	const { enqueueSnackbar } = useSnackbar();
	const queryClient = useQueryClient();

	const key = [updatePostMutationKeyBase] as const;

	const result = useMutation({
		mutationKey: key,
		mutationFn: updatePostAction,
		onSuccess: (data, variables, context) => {
			enqueueSnackbar({ variant: 'success', message: 'Post updated' });
			queryClient.invalidateQueries({ queryKey: getPostBoEditFormQuery({ id: data.objectId }).queryKey });
			queryClient.invalidateQueries({ queryKey: getPostBoEditFormQuery().queryKey });
			onSuccess?.(data, variables, context);
		},
		onError: async (error, variables, context) => {
			let message = 'Unknown error';

			if (error instanceof Error) {
				message = error.message;
			}

			enqueueSnackbar({ variant: 'error', message });

			onError?.(error, variables, context);
		},
		...otherProps,
	});

	return { result, key };
};
