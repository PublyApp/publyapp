import { keepPreviousData, useMutation, useQuery, type MutationOptions } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';

import { functionName } from '@devist/shared/lib/constants';
import type { ParseWebHost } from '@devist/shared/lib/parse/classes/webHost.class';
import type { SaveWebHostInput } from '@devist/shared/validations/webHost.validations';

import { findWebHostAction, saveWebHostAction, type FindWebHostQueryParams } from './webHost.actions';

type SaveWebHostMutationOptions = MutationOptions<ParseWebHost, Error, SaveWebHostInput>;
type SaveWebHostOnSuccess = SaveWebHostMutationOptions['onSuccess'];
type SaveWebHostOnError = SaveWebHostMutationOptions['onError'];

type UseSaveWebHostProps = {
	successMessage?: string;
	onError?: SaveWebHostOnError;
	onSuccess?: SaveWebHostOnSuccess;
};

export const useSaveWebHost = ({ successMessage, onSuccess, onError }: UseSaveWebHostProps = {}) => {
	const key = [functionName.saveWebHost] as const;
	const { enqueueSnackbar } = useSnackbar();

	const result = useMutation({
		mutationKey: key,
		mutationFn: saveWebHostAction,
		onSuccess: (data, variables, context) => {
			enqueueSnackbar(successMessage ?? 'TODO: Translated success message');
			onSuccess?.(data, variables, context);
		},
		onError: (error, variables, context) => {
			enqueueSnackbar(error.message, { variant: 'error' });
			onError?.(error, variables, context);
		},
	});

	return { result, key };
};

export const useFindWebHost = (params: FindWebHostQueryParams) => {
	const key = [functionName.findWebHost, params] as const;

	const result = useQuery({
		queryKey: key,
		queryFn: findWebHostAction,
		placeholderData: keepPreviousData,
	});

	return { result, key };
};
