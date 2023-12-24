import { useCallback, useState, type ComponentProps } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
// import { Box } from '@mui/material';
import Button from '@mui/material/Button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import z from 'zod';

// import ToggleButton from '@mui/material/ToggleButton';
// import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import Iconify from '@devist/ui-react/components/Iconify';
import useBoolean from '@devist/ui-react/hooks/useBoolean';
import { useFindAppFileSuspense } from '@devist/ui-react/lib/react-query/features/appFiles/appFile.hooks';

import FileManagerNewFolderDialog from '@/office/components/file-manager/FileManagerNewFolderDialog';
import { http } from '@/office/lib/axios/http';
import { env } from '@/office/lib/env';
import { endPoint } from '@/shared/lib/constants';
import { protectRequest } from '@/ui-react/lib/axios';

// import EmptyContent from '@/office/components/EmptyContent';
// import Iconify from '@/ui-react/components/Iconify';

const fileSchema = z.custom<File>((data) => {
	// return typeof window === 'undefined' ? data instanceof Buffer : data instanceof File;
	return data instanceof File;
}, 'Data is not an instance of File');

const schema = z.object({
	files: z.array(fileSchema),
});

type Input = z.infer<typeof schema>;

const FileManagerActions = () => {
	const upload = useBoolean();
	const newFolder = useBoolean();
	const [folderName, setFolderName] = useState('');

	const handleChangeFolderName = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		setFolderName(event.target.value);
	}, []);

	const form = useForm<Input>({
		resolver: zodResolver(schema),
	});

	// const { folderPath, setFolderPath } = useFileManager();

	const { key: findAppFileQueryKey } = useFindAppFileSuspense({ folderPath: '/' });
	const queryClient = useQueryClient();

	const { mutate: uploadManyFiles } = useMutation({
		mutationKey: [endPoint.uploadManyFiles] as const,
		mutationFn: async (p: { files: File[] }) => {
			const formData = new FormData();

			p.files.forEach((file) => {
				formData.append('files', file);
			});

			const sessionToken = (await Parse.User.currentAsync())?.getSessionToken() || '';

			await http.post(
				endPoint.uploadManyFiles,
				formData,
				protectRequest({ hasFile: true, sessionToken, restApiKey: env.REST_API_KEY }),
			);
		},
		onSuccess: (/* data, variables, context */) => {
			queryClient.invalidateQueries({ queryKey: [findAppFileQueryKey[0]] });
		},
	});

	const handleDropFiles: ComponentProps<typeof FileManagerNewFolderDialog>['onDropFiles'] = ({ files }) => {
		form.setValue('files', files);
	};

	// const handleUploadFiles: ComponentProps<typeof FileManagerNewFolderDialog>['onUpload'] = (/* { files } */) => {
	// 	form.handleSubmit(
	// 		(data) => {
	// 			uploadManyFiles({ files: data.files });
	// 		},
	// 		(errors) => {
	// 			console.log('====================================');
	// 			console.log('invalid upload datas');
	// 			console.log(errors);
	// 			console.log('====================================');
	// 		},
	// 	)();
	// };
	const handleUploadFiles: ComponentProps<typeof FileManagerNewFolderDialog>['onUpload'] = form.handleSubmit(
		async ({ files }) => {
			uploadManyFiles({ files });
		},
		(errors) => {
			console.log('====================================');
			console.log('invalid upload datas');
			console.log(errors);
			console.log('====================================');
		},
	);

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

			<FileManagerNewFolderDialog
				open={upload.value}
				onClose={upload.setFalse}
				onUpload={handleUploadFiles}
				onDropFiles={handleDropFiles}
			/>

			<FileManagerNewFolderDialog
				open={newFolder.value}
				onClose={newFolder.setFalse}
				title="New Folder"
				onCreate={() => {
					newFolder.setFalse();
					setFolderName('');
					console.info('CREATE NEW FOLDER', folderName);
				}}
				folderName={folderName}
				onChangeFolderName={handleChangeFolderName}
				onUpload={() => {}}
			/>
		</>
	);
};

export default FileManagerActions;
