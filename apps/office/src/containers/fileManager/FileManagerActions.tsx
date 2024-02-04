// import { useCallback, type ComponentProps } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
// import { Box } from '@mui/material';
import Button from '@mui/material/Button';
import { /* useMutation, */ useQueryClient } from '@tanstack/react-query';
import _ from 'lodash';
import { useSnackbar } from 'notistack';
import { useForm } from 'react-hook-form';

// import ToggleButton from '@mui/material/ToggleButton';
// import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

// import {
// 	runCreateAppFileFolder,
// 	type CreateAppFileFolderFunctionParams,
// } from '@devist/shared/lib/parse/cloudRunners/appFile.runner';

import {
	clientCreateFolderSchema,
	clientUploadManyFilesSchema,
	type ClientCreateFolderInput,
	type ClientUploadManyFilesInput,
} from '@devist/shared/validations/file/file.validations.client';
import Iconify from '@devist/ui-react/components/Iconify';
import useBoolean from '@devist/ui-react/hooks/useBoolean';
// import { endPoint } from '@/shared/lib/constants';
// import { uploadManyFilesAction } from '@/ui-react/lib/react-query/features/appFiles/appFile.actions';
// import { protectRequest } from '@/ui-react/lib/axios';
import {
	findAppFileQueryKeyString,
	useCreateAppFileFolder,
	useUploadManyFilesMutation,
} from '@devist/ui-react/lib/react-query/features/appFiles/appFile.hooks';

// import { useFindAppFileSuspense } from '@devist/ui-react/lib/react-query/features/appFiles/appFile.hooks';
// import FileManagerNewFolderDialog from '@/office/components/file-manager/FileManagerNewFolderDialog';

import FileManagerActionDialog from '@/office/components/file-manager/FileManagerActionDialog';
import { http } from '@/office/lib/axios/http';
import { env } from '@/office/lib/env';

// import { endPoint } from '@/shared/lib/constants';
// import { uploadManyFilesAction } from '@/ui-react/lib/react-query/features/appFiles/appFile.actions';
// import { protectRequest } from '@/ui-react/lib/axios';

import useFileManager from './useFilManager';

// import { http } from '@/office/lib/axios/http';
// import EmptyContent from '@/office/components/EmptyContent';
// import Iconify from '@/ui-react/components/Iconify';

// const fileSchema = z.custom<File>((data) => {
// 	// return typeof window === 'undefined' ? data instanceof Buffer : data instanceof File;
// 	return data instanceof File;
// }, 'Data is not an instance of File');

// const folderNameSchema = z
// 	.string()
// 	.min(1)
// 	.refine((data) => {
// 		return data.indexOf('/') !== -1;
// 	}, "folder name must no contain slashes ('/')");

// const newFolderSchema = z.object({
// 	folderName: folderNameSchema,
// 	files: z.array(fileSchema).min(1).optional(),
// 	parentFolderPath: folderNameSchema.optional(),
// });

// type NewFolderInput = z.infer<typeof newFolderSchema>;

const FileManagerActions = () => {
	const upload = useBoolean();
	const newFolder = useBoolean();
	const queryClient = useQueryClient();
	const { enqueueSnackbar } = useSnackbar();
	// eslint-disable-next-line @typescript-eslint/naming-convention
	const { folderPath: _currentFolderPath } = useFileManager();
	const currentFolderPath = decodeURIComponent(_currentFolderPath);

	const uploadForm = useForm<ClientUploadManyFilesInput>({
		resolver: zodResolver(clientUploadManyFilesSchema),
	});

	// const { parentFolderPath, setparentFolderPath } = useFileManager();

	// const { key: findAppFileQueryKey } = useFindAppFileSuspense({ parentFolderPath: '/' });

	const {
		result: { mutate: uploadManyFiles },
	} = useUploadManyFilesMutation({
		options: {
			onSuccess: (/* data, variables, context */) => {
				upload.setFalse();
				enqueueSnackbar('Files uploaded', { variant: 'success' });
				queryClient.invalidateQueries({ queryKey: [findAppFileQueryKeyString] });
			},
		},
	});

	const handleUpload = ({
		files,
		// parentFolderPath,
	}: {
		files: File[];
		parentFolderPath?: string;
	}) => {
		uploadManyFiles({ files, parentFolderPath: currentFolderPath, http, restApiKey: env.REST_API_KEY });
	};

	// const handleDropFilesUpload: ComponentProps<typeof FileManagerActionDialog>['onDropFiles'] = ({ files }) => {
	// 	uploadForm.setValue('files', files);
	// };

	// const handleUploadFiles: ComponentProps<typeof FileManagerNewFolderDialog>['onUpload'] = uploadForm.handleSubmit(
	// 	async ({ files }) => {
	// 		uploadManyFiles({
	// 			files,
	// 			// parentFolderPath: '/sfdsfds'
	// 			http,
	// 			restApiKey: env.REST_API_KEY,
	// 		});
	// 	},
	// );

	// ================
	const newFolderForm = useForm<ClientCreateFolderInput>({
		resolver: zodResolver(clientCreateFolderSchema),
		defaultValues: {
			folderName: '',
		},
		// defaultValues:async (_payload) => {
		// 	return {}
		// },
	});

	// const handleChangeFolderName = useCallback(
	// 	(event: React.ChangeEvent<HTMLInputElement>) => {
	// 		// setNewFolderName(event.target.value);
	// 		// console.log(event.target.value);
	// 		// newFolderForm.register('folderName').onChange(event);
	// 		newFolderForm.setValue('folderName', event.target.value);
	// 	},
	// 	[newFolderForm],
	// );

	const {
		result: { mutate: createAppFileFolder },
	} = useCreateAppFileFolder({
		options: {
			onSuccess: (/* data, variables, context */) => {
				queryClient.invalidateQueries({ queryKey: [findAppFileQueryKeyString] });
				newFolder.setFalse();
				enqueueSnackbar('Folder created', { variant: 'success' });
			},
		},
	});

	const handleCreateFolder = ({
		folderName,
		files,
		// parentFolderPath,
	}: {
		folderName: string;
		files?: File[];
		parentFolderPath?: string;
	}) => {
		createAppFileFolder({ folderName, files, parentFolderPath: currentFolderPath, http, restApiKey: env.REST_API_KEY });
	};
	// const { mutate: createAppFileFolder } = useMutation({
	// 	mutationKey: [endPoint.uploadManyFiles] as const,
	// 	mutationFn: async ({ parentFolderPath, folderName }: CreateAppFileFolderFunctionParams) => {
	// 		const appFileFolder = await runCreateAppFileFolder({ folderName, parentFolderPath });
	// 		uploadManyFilesAction({  })
	// 		return appFileFolder;
	// 	},
	// 	onSuccess: (data, _variables, _context) => {
	// 		const parentFolderPath = data.get('path');
	// 		const files = newFolderForm.getValues().files ?? [];
	// 		const restApiKey = env.REST_API_KEY;

	// 		uploadManyFiles({ files, http, restApiKey, parentFolderPath });
	// 		queryClient.invalidateQueries({ queryKey: [findAppFileQueryKeyString] });
	// 	},
	// });

	// const handleDropFilesNewFolder: ComponentProps<typeof FileManagerNewFolderDialog>['onDropFiles'] = ({ files }) => {
	// 	newFolderForm.setValue('files', files);
	// };

	// const handleCreateFolder: ComponentProps<typeof FileManagerNewFolderDialog>['onUpload'] = newFolderForm.handleSubmit(
	// 	async ({ files, folderName, parentFolderPath }) => {
	// 		createAppFileFolder({ folderName, parentFolderPath, files, http, restApiKey: env.REST_API_KEY });
	// 	},
	// 	// (err) => {
	// 	// 	console.log('handleCreateFolder', err);
	// 	// },
	// );

	return (
		<>
			<Button
				variant="contained"
				startIcon={<Iconify icon="eva:cloud-upload-fill" />}
				onClick={newFolder.setTrue}
				// disabled
			>
				New Folder
			</Button>
			<Button variant="contained" startIcon={<Iconify icon="eva:cloud-upload-fill" />} onClick={upload.setTrue}>
				Upload
			</Button>

			<FileManagerActionDialog
				open={upload.value}
				onClose={upload.setFalse}
				action="uploadFiles"
				form={uploadForm}
				onUpload={handleUpload}
				accept={{ 'image/*': [] }} // image only for now
			/>

			<FileManagerActionDialog
				open={newFolder.value}
				onClose={newFolder.setFalse}
				title="New Folder"
				action="createFolder"
				form={newFolderForm}
				onCreate={handleCreateFolder}
				accept={{ 'image/*': [] }} // image only for now
			/>
		</>
	);
};

export default FileManagerActions;

// ========================
