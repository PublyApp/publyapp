import { useEffect } from 'react';

import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'react-toastify';

import { functionName } from '@devist/shared/utils/constants';

import { getWebHostsAction, saveWebHostAction, type GetWebHostsQueryParams } from './webHost.actions';

type UseSaveWebHostProps = {
	successMessage?: string;
	onError?: () => void;
	onSuccess?: () => void;
};

export const useSaveWebHost = ({ successMessage, onSuccess, onError }: UseSaveWebHostProps = {}) => {
	const key = [functionName.saveWebHost] as const;

	const result = useMutation({
		mutationKey: key,
		mutationFn: saveWebHostAction,
	});

	const { isError, error, isSuccess } = result;

	// ? may should I put this effect inside the useSaveWebHost hook too?
	useEffect(() => {
		if (isError && error) {
			toast.error(error.message);
			onError?.();
		}
	}, [isError, error]);

	// ? may should I put this effect inside the useSaveWebHost hook too?
	useEffect(() => {
		if (isSuccess) {
			toast.success(successMessage ?? 'TODO: Translated success message');
			onSuccess?.();
		}
	}, [isSuccess]);

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
