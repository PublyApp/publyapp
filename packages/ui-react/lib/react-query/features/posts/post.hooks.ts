import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useNavigate } from 'react-router-dom';

import { BO_PATH_NAMES } from '@/shared/lib/constants';
import useHttpClients from '@/ui-react/hooks/useHttpClients';
import useTranslate from '@/ui-react/hooks/useTranslate';

import PostActions, { type FindPostQueryParams, type GetPostByIdQueryParams } from './post.actions';

// ---- 1 --------------------------------------------------------------------------------

export const useCreatePostMutation = () => {
	const { enqueueSnackbar } = useSnackbar();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { parseApi } = useHttpClients();

	const key = [PostActions.createPostMutationKeyBase] as const;

	const postActions = new PostActions(parseApi);

	const result = useMutation({
		mutationKey: key,
		mutationFn: postActions.createPostAction,
		onSuccess: async (data /* , variables, context */) => {
			enqueueSnackbar({ variant: 'success', message: 'New post created' });
			queryClient.setQueryData([PostActions.getPostQueryKeyBase, { id: data.objectId }], data);
			queryClient.invalidateQueries({ queryKey: [PostActions.findPostQueryKeyBase] });
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
	params: GetPostByIdQueryParams;
	options?: Omit<ReturnType<typeof PostActions.prototype.getPostByIdQuery>, 'queryKey' | 'queryFn'>;
};

export const useGetPostByIdSuspenseQuery = (props: UseGetPostByIdSuspenseQueryProps) => {
	const { parseApi } = useHttpClients();
	const postActions = new PostActions(parseApi);

	const query = postActions.getPostByIdQuery(props.params);

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
	params: Omit<FindPostQueryParams, 'locale'>;
	options?: Omit<ReturnType<typeof PostActions.prototype.findPostQuery>, 'queryKey' | 'queryFn'>;
};

export const useFindPostSuspenseQuery = (props: UseFindPostQueryProps) => {
	const { parseApi } = useHttpClients();
	const { locale } = useTranslate();

	const postActions = new PostActions(parseApi);

	const query = postActions.findPostQuery({ ...props.params, locale });

	const result = useSuspenseQuery({
		...query,
		...props.options,
	});

	return {
		key: query.queryKey,
		result,
	};
};

export const useFindPostQuery = (props: UseFindPostQueryProps) => {
	const { locale } = useTranslate();
	const { parseApi } = useHttpClients();

	const postActions = new PostActions(parseApi);

	const query = postActions.findPostQuery({ ...props.params, locale });

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

export const useUpdatePostMutation = () => {
	const { parseApi } = useHttpClients();
	const { enqueueSnackbar } = useSnackbar();
	const queryClient = useQueryClient();

	const key = [PostActions.updatePostMutationKeyBase] as const;

	const postActions = new PostActions(parseApi);

	const result = useMutation({
		mutationKey: key,
		mutationFn: postActions.updatePostAction,
		onSuccess: (data /* variables, context */) => {
			enqueueSnackbar({ variant: 'success', message: 'Post updated' });
			queryClient.setQueryData([PostActions.getPostQueryKeyBase, { id: data.objectId }], data);
			queryClient.invalidateQueries({ queryKey: [PostActions.findPostQueryKeyBase] });
		},
		onError: async (error /* , variables, context */) => {
			let message = 'Unknown error';

			if (error instanceof Error) {
				message = error.message;
			}

			enqueueSnackbar({ variant: 'error', message });
		},
	});

	return { result, key };
};
