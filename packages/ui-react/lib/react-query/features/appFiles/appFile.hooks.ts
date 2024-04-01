import { useMutation, useSuspenseQuery, type UseMutationOptions } from '@tanstack/react-query';

import { endPoint, functionName } from '@devist/shared/lib/constants';

import parseApi from '@/ui-react/api/parse/ParseApi';

// import AppFileActions,  { UploadManyFilesActionParams } from "./appFile.actions";

import AppFileActions, {
	type CreateAppFileFolderActionParams,
	type FindAppFileQueryParams,
	type UploadManyFilesActionParams,
	// createAppFileFolderAction,
	// findAppFileAction,
	// uploadManyFilesAction,
	// type CreateAppFileFOlderActionParams,
	// type UploadManyFilesActionInput,
} from './appFile.actions';

// ---- 1 --------------------------------------------------------------------------------

export const findAppFileQueryKeyString = functionName.findAppFile;

export const useFindAppFileSuspense = (params: FindAppFileQueryParams) => {
	const key = [findAppFileQueryKeyString, params] as const;

	const appFileActions = new AppFileActions(parseApi);

	const result = useSuspenseQuery({
		queryKey: key,
		queryFn: appFileActions.findAppFileAction,
		// placeholderData: keepPreviousData,
	});

	return { result, key };
};

// ---- 2 --------------------------------------------------------------------------------

export const uploadManyFilesMutationKeyString = endPoint.uploadManyFiles;

type UseUploadManyFilesMutationProps = {
	options?: Omit<
		UseMutationOptions<
			Awaited<ReturnType<typeof AppFileActions.prototype.uploadManyFilesAction>>,
			Error,
			UploadManyFilesActionParams,
			unknown
		>,
		'mutationKey' | 'mutationFn'
	>;
};

export const useUploadManyFilesMutation = ({ options }: UseUploadManyFilesMutationProps = {}) => {
	const key = [uploadManyFilesMutationKeyString] as const;

	const appFileActions = new AppFileActions(parseApi);

	const result = useMutation({
		mutationKey: key,
		mutationFn: appFileActions.uploadManyFilesAction,
		...options,
	});

	return { result, key };
};

// ---- 3 --------------------------------------------------------------------------------

export const createAppFileFolderMutationKey = 'createAppFileFolder' as const;

type UseCreateAppFileFolderMutationProps = {
	options: Omit<
		UseMutationOptions<
			Awaited<ReturnType<typeof AppFileActions.prototype.createAppFileFolderAction>>,
			Error,
			CreateAppFileFolderActionParams,
			unknown
		>,
		'mutationKey' | 'mutationFn'
	>;
};

export const useCreateAppFileFolder = ({ options }: UseCreateAppFileFolderMutationProps) => {
	const key = [createAppFileFolderMutationKey] as const;

	const appFileActions = new AppFileActions(parseApi);

	const result = useMutation({
		mutationKey: key,
		mutationFn: appFileActions.createAppFileFolderAction,
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
