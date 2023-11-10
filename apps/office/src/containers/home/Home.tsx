import { useRef, useState } from 'react';

import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import useLocale from '@devist/ui-react/hooks/useLocale';

const Home = () => {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { t } = useTranslation();
	const { locale, setLocale /* , t */ } = useLocale();

	// const fileList = fileInputRef.current?.files;
	const [files, setFiles] = useState<File[]>([]);

	// console.log('ggggg');
	return (
		<>
			<Typography variant="h1">Home / {t('common:hello')}</Typography>
			<Button
				onClick={() => {
					setLocale(locale === 'en' ? 'fr' : 'en');
				}}
			>
				Change locale
			</Button>
			<Typography>Test Parse Upload</Typography>
			{/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
			<label htmlFor="raised-button-file">
				<input
					accept="image/*"
					ref={fileInputRef}
					// className={classes.input}
					hidden
					id="raised-button-file"
					multiple
					type="file"
					onChange={(e) => {
						setFiles([...(e.currentTarget.files ?? [])]);
					}}
				/>
			</label>
			<Typography>Preview</Typography>
			{files.map((file) => {
				return <Typography key={file.name}>{file.name}</Typography>;
			})}
			<Button
				onClick={() => {
					fileInputRef.current?.click();
				}}
			>
				Choose File
			</Button>
			<Button
				onClick={async () => {
					// files.forEach(())
					if (files.length < 1) return;
					const file = files[0];

					const formData = new FormData();
					formData.set('file', file);

					// Parse.Cloud.run(functionName.uploadFile, formData);
					const url = new URL('http://localhost:6180/upload-file-single');
					await fetch(url, {
						method: 'post',
						body: formData,
						headers: {
							'X-Parse-Session-Token': Parse.User.current()?.getSessionToken() ?? '',
						},
					});

					// const toBase64 = (file: File): Promise<string | ArrayBuffer | null> => {
					// 	return new Promise((resolve, reject) => {
					// 		const reader = new FileReader();
					// 		reader.readAsDataURL(file);

					// 		reader.onload = () => {
					// 			return resolve(reader.result);
					// 		};

					// 		reader.onerror = reject;
					// 	});
					// };

					// const getFileUploadInput = async (file: File) => {
					// 	// const arrayBuffer = await file.arrayBuffer();
					// 	// const buffer = [...new Uint32Array(arrayBuffer)];
					// 	const base64 = await toBase64(file);

					// 	return {
					// 		name: file.name,
					// 		type: file.type,
					// 		base64,
					// 		// buffer,
					// 	};
					// };

					// const uploadInput = await getFileUploadInput(file);
					// Parse.Cloud.run(functionName.uploadFile, uploadInput);
				}}
			>
				Upload
			</Button>
		</>
	);
};

export default Home;
