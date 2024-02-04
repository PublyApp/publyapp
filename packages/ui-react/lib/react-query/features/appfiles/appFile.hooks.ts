import { useMutation, useSuspenseQuery, type UseMutationOptions } from '@tanstack/react-query';

import { endPoint, functionName } from '@devist/shared/lib/constants';

import type { AppFile } from '@/shared/types/db/appFile.types';

import {
	createAppFileFolderAction,
	findAppFileAction,
	uploadManyFilesAction,
	type CreateAppFileFOlderActionParams,
	type FindAppFileQueryParams,
	type UploadManyFilesActionInput,
} from './appFile.actions';

// ---- 1 --------------------------------------------------------------------------------

export const findAppFileQueryKeyString = functionName.findAppFile;

export const useFindAppFileSuspense = (params: FindAppFileQueryParams) => {
	const key = [findAppFileQueryKeyString, params] as const;

	const result = useSuspenseQuery({
		queryKey: key,
		queryFn: findAppFileAction,
		// placeholderData: keepPreviousData,
	});

	return { result, key };
};

// ---- 2 --------------------------------------------------------------------------------

export const uploadManyFilesMutationKeyString = endPoint.uploadManyFiles;

type UseUploadManyFilesMutationProps = {
	options?: Omit<
		UseMutationOptions<AppFile[], Error, UploadManyFilesActionInput, unknown>,
		'mutationKey' | 'mutationFn'
	>;
};

export const useUploadManyFilesMutation = ({ options }: UseUploadManyFilesMutationProps = {}) => {
	const key = [uploadManyFilesMutationKeyString] as const;

	const result = useMutation({
		mutationKey: key,
		mutationFn: uploadManyFilesAction,
		...options,
	});

	return { result, key };
};

// ---- 3 --------------------------------------------------------------------------------

export const createAppFileFolderMutationKey = 'createAppFileFolder' as const;

type UseCreateAppFileFolderMutationProps = {
	options: Omit<
		UseMutationOptions<
			Awaited<ReturnType<typeof createAppFileFolderAction>>,
			Error,
			CreateAppFileFOlderActionParams,
			unknown
		>,
		'mutationKey' | 'mutationFn'
	>;
};

export const useCreateAppFileFolder = ({ options }: UseCreateAppFileFolderMutationProps) => {
	const key = [createAppFileFolderMutationKey] as const;

	const result = useMutation({
		mutationKey: key,
		mutationFn: createAppFileFolderAction,
		...options,
		// onSuccess: (data, _variables, _context) => {
		// 	const parentFolderPath = data.get('path');
		// 	const files = newFolderForm.getValues().files ?? [];
		// 	const restApiKey = env.REST_API_KEY;

		// 	uploadManyFiles({ files, http, restApiKey, parentFolderPath });
		// 	queryClient.invalidateQueries({ queryKey: [findAppFileQueryKeyString] });
		// },
	});

	return { result, key };
};
