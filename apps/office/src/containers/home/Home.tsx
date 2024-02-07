import { useRef, useState } from 'react';

import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useNavigate, useRevalidator } from 'react-router-dom';

import useLocale from '@devist/ui-react/hooks/useLocale';

import RouterLink from '@/office/components/RouterLink';
import { useMainStore } from '@/office/lib/zustand/store';
import { BO_PATH_NAMES, PARSE_SESSION_TOKEN_HEADER_KEY } from '@/shared/lib/constants';
import { useLogOutMutation } from '@/ui-react/lib/react-query/features/auth/auth.hooks';

const Home = () => {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { t } = useTranslation();
	const { lang, setLocale } = useLocale();

	// =========================
	// const addBear = useMainStore((state) => {
	// 	return state.dummySlice.addBear;
	// });
	const removeBear = useMainStore((state) => {
		return state.dummySlice.removeBear;
	});
	const bear = useMainStore((state) => {
		return state.dummySlice.bear;
	});
	const folderPath = useMainStore((state) => {
		return state.fileManager.folderPath;
	});
	const goToFolder = useMainStore((state) => {
		return state.fileManager.goToFolder;
	});

	// const fileList = fileInputRef.current?.files;
	const [files, setFiles] = useState<File[]>([]);

	const { revalidate } = useRevalidator();
	const navigate = useNavigate();

	const {
		result: { mutate: logOut },
	} = useLogOutMutation({
		onSuccess: () => {
			revalidate();
			navigate(BO_PATH_NAMES.auth.login);
		},
	});

	// console.log('ggggg');
	return (
		<>
			<Typography variant="h1">Home / {t('common:hello')}</Typography>
			<Button
				onClick={() => {
					// const locale = i18n.language;
					setLocale(lang.value === 'en' ? 'fr' : 'en');
				}}
				color="primary"
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
				color="secondary"
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
							[PARSE_SESSION_TOKEN_HEADER_KEY]: Parse.User.current()?.getSessionToken() ?? '',
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
			<Divider>fgzefgzegzefgzegzefgz</Divider>
			<Typography>folderPath: {folderPath}</Typography>
			<Button
				variant="contained"
				onClick={() => {
					goToFolder('/a');
				}}
			>
				go to Folder '/a'
			</Button>
			<Button
				variant="contained"
				onClick={() => {
					goToFolder('/b');
				}}
			>
				go to Folder '/b'
			</Button>
			<Typography>bear count: {bear}</Typography>
			<Button
				variant="contained"
				onClick={() => {
					// addBear();
					logOut();
				}}
			>
				{/* add bear */}
				log out
			</Button>
			<Button
				variant="contained"
				color="warning"
				onClick={() => {
					removeBear();
				}}
			>
				remove Bear
			</Button>
			AAAAAAAAAAA
			<RouterLink href="/unexistant-path">test link to 404 not found</RouterLink>
			<br />
			<RouterLink href="/dashboard/posts/edit/fsdfsfsfdsdfsdfs">test not found resource</RouterLink>
		</>
	);
};

export default Home;
