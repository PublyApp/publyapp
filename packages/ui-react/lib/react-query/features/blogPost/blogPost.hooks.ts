import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseInfiniteQuery,
	useSuspenseQuery,
	type MutationOptions,
	type UseMutationOptions,
} from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useNavigate } from 'react-router-dom';

import { BO_PATH_NAMES } from '@/shared/lib/constants';
import useTranslate from '@/ui-react/hooks/useTranslate';

import {
	addSlugToBlogPostAction,
	addSlugToBlogPostMutationKeyBase,
	createBlogPostAction,
	createBlogPostMutationKeyBase,
	findBlogPostBoTableQuery,
	findBlogPostSlugQuery,
	getBlogPostBoEditFormQuery,
	setBlogPostCurrentSlugAction,
	setBlogPostCurrentSlugMutationKeyBase,
	updateBlogPostAction,
	updateBlogPostMutationKeyBase,
	type FindBlogPostBoTableQueryParams,
	type FindBlogPostSlugQueryParams,
	type GetBlogPostBoEditFormQueryParams,
	// type FindBlogPostQueryParams,
	// type GetBlogPostByIdQueryParams,
} from './blogPost.actions';

// ---- 1 --------------------------------------------------------------------------------
type UseCreateBlogPostMutationProps = Omit<
	MutationOptions<
		Awaited<ReturnType<typeof createBlogPostAction>>,
		unknown,
		Parameters<typeof createBlogPostAction>[0]
	>,
	'mutationKey' | 'mutationFn'
>;

export const useCreateBlogPostMutation = ({
	onSuccess,
	onError,
	...otherProps
}: UseCreateBlogPostMutationProps = {}) => {
	const { enqueueSnackbar } = useSnackbar();
	const navigate = useNavigate();
	// const queryClient = useQueryClient();

	const key = [createBlogPostMutationKeyBase] as const;

	const result = useMutation({
		mutationKey: key,
		mutationFn: createBlogPostAction,
		onSuccess: async (data, variables, context) => {
			onSuccess?.(data, variables, context);

			enqueueSnackbar({ variant: 'success', message: 'New post created' });
			// queryClient.setQueryData([getBlogPostQueryKeyBase, { id: data.objectId }], data);
			// queryClient.invalidateQueries({ queryKey: [findBlogPostQueryKeyBase] });
			navigate(BO_PATH_NAMES.dashboard.posts.edit(data.objectId));
		},
		onError: async (error, variables, context) => {
			onError?.(error, variables, context);

			let message = 'Unknown error';

			if (error instanceof Error) {
				message = error.message;
			}

			enqueueSnackbar({ variant: 'error', message });
		},
		...otherProps,
	});

	return {
		result,
		key,
	};
};

// ---- 2 --------------------------------------------------------------------------------

type UseGetBlogPostByIdSuspenseQueryProps = {
	params: GetBlogPostBoEditFormQueryParams;
	options?: Omit<ReturnType<typeof getBlogPostBoEditFormQuery>, 'queryKey' | 'queryFn'>;
};

export const useGetBlogPostByIdSuspenseQuery = (props: UseGetBlogPostByIdSuspenseQueryProps) => {
	const query = getBlogPostBoEditFormQuery(props.params);

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

type UseFindBlogPostQueryProps = {
	params: Omit<FindBlogPostBoTableQueryParams, 'locale'>;
	options?: Omit<ReturnType<typeof findBlogPostBoTableQuery>, 'queryKey' | 'queryFn'>;
};

export const useFindBlogPostBoTableSuspenseQuery = (props: UseFindBlogPostQueryProps) => {
	const { locale } = useTranslate();

	const query = findBlogPostBoTableQuery({ ...props.params, locale });

	const result = useSuspenseQuery({
		...query,
		...props.options,
	});

	return {
		key: query.queryKey,
		result,
	};
};

export const useFindBlogPostBoTableQuery = (props: UseFindBlogPostQueryProps) => {
	const { locale } = useTranslate();

	const query = findBlogPostBoTableQuery({ ...props.params, locale });

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

type UseUpdateBlogPostMutationProps = Omit<
	UseMutationOptions<
		Awaited<ReturnType<typeof updateBlogPostAction>>,
		Error,
		Parameters<typeof updateBlogPostAction>[0]
	>,
	'mutationKey' | 'mutationFn'
>;

export const useUpdateBlogPostMutation = (props: UseUpdateBlogPostMutationProps = {}) => {
	const { onError, onSuccess, ...otherProps } = props;
	const { enqueueSnackbar } = useSnackbar();
	const queryClient = useQueryClient();

	const key = [updateBlogPostMutationKeyBase] as const;

	const result = useMutation({
		mutationKey: key,
		mutationFn: updateBlogPostAction,
		onSuccess: (data, variables, context) => {
			enqueueSnackbar({ variant: 'success', message: 'BlogPost updated' });
			queryClient.invalidateQueries({ queryKey: getBlogPostBoEditFormQuery({ id: data.objectId }).queryKey });
			queryClient.invalidateQueries({ queryKey: getBlogPostBoEditFormQuery().queryKey });
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

// ---- 5 --------------------------------------------------------------------------------

type UseFindBlogPostSlugSuspenseQueryProps = {
	params: FindBlogPostSlugQueryParams;
	options?: Omit<ReturnType<typeof findBlogPostSlugQuery>, 'queryKey' | 'queryFn'>;
};

export const useFindBlogPostSlugSuspenseQuery = (props: UseFindBlogPostSlugSuspenseQueryProps) => {
	const query = findBlogPostSlugQuery(props.params);

	const result = useSuspenseInfiniteQuery({
		...query,
		// initialPageParam: Number(0),
		// getNextPageParam: (_lastPage /* , allPages, lastPageParam, allPageParams */) => {
		// 	return null;
		// },
		// getPreviousPageParam: (_firstPage /* , allPages, firstPageParam, allPageParams */) => {
		// 	return null;
		// },
		...props.options,
	});

	return { result, key: query.queryKey };
};

// ---- 6 --------------------------------------------------------------------------------
type UseAddSlugToBlogPostMutationProps = Omit<
	MutationOptions<
		Awaited<ReturnType<typeof addSlugToBlogPostAction>>,
		unknown,
		Parameters<typeof addSlugToBlogPostAction>[0]
	>,
	'mutationKey' | 'mutationFn'
>;

export const useAddSlugToBlogPostMutation = ({
	onSuccess,
	onError,
	...otherProps
}: UseAddSlugToBlogPostMutationProps = {}) => {
	const queryClient = useQueryClient();
	const { enqueueSnackbar } = useSnackbar();
	const { t } = useTranslate();

	const key = [addSlugToBlogPostMutationKeyBase] as const;

	const result = useMutation({
		mutationKey: key,
		mutationFn: addSlugToBlogPostAction,
		onSuccess: async (data, variables, context) => {
			onSuccess?.(data, variables, context);

			// eslint-disable-next-line @typescript-eslint/naming-convention
			const _findBlogPostSlugQuery = findBlogPostSlugQuery();

			queryClient.invalidateQueries({ queryKey: [_findBlogPostSlugQuery.queryKey[0]] });
			enqueueSnackbar({ variant: 'success', message: t('slug-added-to-post') });
			// // queryClient.setQueryData([getBlogPostQueryKeyBase, { id: data.objectId }], data);
			// // queryClient.invalidateQueries({ queryKey: [findBlogPostQueryKeyBase] });
			// navigate(BO_PATH_NAMES.dashboard.posts.edit(data.objectId));
		},
		onError: async (error, variables, context) => {
			onError?.(error, variables, context);

			let message = 'Unknown error';

			if (error instanceof Error) {
				message = error.message;
			}

			enqueueSnackbar({ variant: 'error', message });
		},
		...otherProps,
	});

	return {
		result,
		key,
	};
};

// ---- 6 --------------------------------------------------------------------------------
type UseSetToBlogPostCurrentSlugMutationProps = Omit<
	MutationOptions<
		Awaited<ReturnType<typeof setBlogPostCurrentSlugAction>>,
		unknown,
		Parameters<typeof setBlogPostCurrentSlugAction>[0]
	>,
	'mutationKey' | 'mutationFn'
>;

export const useSetBlogPostCurrentSlugMutation = ({
	onSuccess,
	onError,
	...otherProps
}: UseSetToBlogPostCurrentSlugMutationProps = {}) => {
	const queryClient = useQueryClient();
	const { enqueueSnackbar } = useSnackbar();
	const { t } = useTranslate();

	const key = [setBlogPostCurrentSlugMutationKeyBase] as const;

	const result = useMutation({
		mutationKey: key,
		mutationFn: setBlogPostCurrentSlugAction,
		onSuccess: async (data, variables, context) => {
			onSuccess?.(data, variables, context);

			// eslint-disable-next-line @typescript-eslint/naming-convention
			const _findBlogPostSlugQuery = findBlogPostSlugQuery();

			queryClient.invalidateQueries({ queryKey: [_findBlogPostSlugQuery.queryKey[0]] });
			enqueueSnackbar({ variant: 'success', message: t('slug-added-to-post') });
		},
		onError: async (error, variables, context) => {
			onError?.(error, variables, context);

			let message = 'Unknown error';

			if (error instanceof Error) {
				message = error.message;
			}

			enqueueSnackbar({ variant: 'error', message });
		},
		...otherProps,
	});

	return {
		result,
		key,
	};
};
