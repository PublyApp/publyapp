// import { useEffect } from 'react';

import { keepPreviousData, useMutation, useQuery, type MutationOptions } from '@tanstack/react-query';
import { toast } from 'react-toastify';

import type { ParseWebHost } from '@devist/shared/parse/classes/webHost.class';
import { functionName } from '@devist/shared/utils/constants';
import type { SaveWebHostInput } from '@devist/shared/validations/webHost.validations';

import { getWebHostsAction, saveWebHostAction, type GetWebHostsQueryParams } from './webHost.actions';

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

	const result = useMutation({
		mutationKey: key,
		mutationFn: saveWebHostAction,
		onSuccess: (data, variables, context) => {
			toast.success(successMessage ?? 'TODO: Translated success message');
			onSuccess?.(data, variables, context);
		},
		onError: (error, variables, context) => {
			toast.error(error.message);
			onError?.(error, variables, context);
		},
	});

	// const { isError, error, isSuccess, data } = result;

	// // ? may should I put this effect inside the useSaveWebHost hook too?
	// useEffect(() => {
	// 	if (isError && error) {
	// 		toast.error(error.message);
	// 		onError?.();
	// 	}
	// }, [isError, error]);

	// // ? may should I put this effect inside the useSaveWebHost hook too?
	// useEffect(() => {
	// 	if (data && isSuccess) {
	// 		toast.success(successMessage ?? 'TODO: Translated success message');
	// 		onSuccess?.();
	// 	}
	// }, [isSuccess, data]);

	return { result, key };
};

export const useGetWebHosts = (params: GetWebHostsQueryParams) => {
	const key = [functionName.getWebHosts, params] as const;

	const result = useQuery({
		queryKey: key,
		queryFn: getWebHostsAction,
		placeholderData: keepPreviousData,
	});

	return { result, key };
};
