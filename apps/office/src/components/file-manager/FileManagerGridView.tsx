/* eslint-disable @typescript-eslint/no-use-before-define */
import { Suspense, useMemo, useRef, type ComponentProps } from 'react';

import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import { nanoid } from 'nanoid';

import { folderPathSelector, goToFolderSelector } from '@office/lib/zustand/features/fileManager.slice';
import { useMainStore } from '@office/lib/zustand/store';
import { useFindAppFileSuspense } from '@ui-react/lib/react-query/features/appFiles/appFile.hooks';

import CustomBreadcrumbs from '../CustomBreadcrumbs';

import FileManagerFileItem from './FileManagerFileItem';
import FileManagerFolderItem from './FileManagerFolderItem';
import FileManagerPanel from './FileManagerPanel';
import { appFileData, appFolderData } from './utils';

// components
// import Iconify from 'src/components/iconify';
// import { TableProps } from 'src/components/table';
// //
// import FileManagerPanel from './file-manager-panel';
// import FileManagerFileItem from './file-manager-file-item';
// import FileManagerFolderItem from './file-manager-folder-item';
// import FileManagerActionSelected from './file-manager-action-selected';
// import FileManagerShareDialog from './file-manager-share-dialog';
// import FileManagerNewFolderDialog from './file-manager-new-folder-dialog';

// ----------------------------------------------------------------------

// type Props = {
// 	data: IFile[];
// 	onOpenConfirm: VoidFunction;
// 	onDeleteItem: (id: string) => void;
// };

const FileManagerGridView = (/* { table,  data, dataFiltered, onDeleteItem, onOpenConfirm }: Props */) => {
	// const { selected, onSelectRow: onSelectItem, onSelectAllRows: onSelectAllItems } = table;

	const containerRef = useRef(null);

	// const [folderName, setFolderName] = useState('');

	// const [inviteEmail, setInviteEmail] = useState('');

	// const share = useBoolean();

	// const newFolder = useBoolean();

	// const upload = useBoolean();

	// const files = useBoolean();

	// const folders = useBoolean();

	// const handleChangeInvite = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
	// 	setInviteEmail(event.target.value);
	// }, []);

	// const handleChangeFolderName = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
	// 	setFolderName(event.target.value);
	// }, []);

	// const {
	// 	result: { data },
	// } = useFindAppFileSuspense({});

	return (
		<>
			<Box ref={containerRef}>
				<Panel />
				<Breadcrumbs />

				<Box
					gap={3}
					display="grid"
					gridTemplateColumns={{
						xs: 'repeat(1, 1fr)',
						sm: 'repeat(2, 1fr)',
						md: 'repeat(3, 1fr)',
						lg: 'repeat(4, 1fr)',
					}}
				>
					<Suspense fallback={<GridSkeleton />}>
						<GridItems />
					</Suspense>
				</Box>
			</Box>

			{/* <FileManagerShareDialog
				open={share.value}
				inviteEmail={inviteEmail}
				onChangeInvite={handleChangeInvite}
				onClose={() => {
					share.onFalse();
					setInviteEmail('');
				}}
			/> */}

			{/* <FileManagerNewFolderDialog open={upload.value} onClose={upload.onFalse} /> */}

			{/* <FileManagerNewFolderDialog
				open={newFolder.value}
				onClose={newFolder.onFalse}
				title="New Folder"
				onCreate={() => {
					newFolder.onFalse();
					setFolderName('');
					console.info('CREATE NEW FOLDER', folderName);
				}}
				folderName={folderName}
				onChangeFolderName={handleChangeFolderName}
			/> */}
		</>
	);
};

export default FileManagerGridView;

// --------------------
const Panel = () => {
	// const folderPath = useMainStore(folderPathSelector);
	// const getFolde

	return (
		<FileManagerPanel
			title="sfsf"
			sx={{ marginBottom: 0 }}
			// subTitle={`${
			// 	data.filter((item) => {
			// 		return item.type === 'folder';
			// 	}).length
			// } folders`}
			onOpen={/* newFolder.setTrue */ () => {}}
			// collapse={/* folders.value */ false}
			// onCollapse={/* folders.toggle */ () => {}}
		/>
	);
};

// --------------------
const Breadcrumbs = () => {
	const folderPath = useMainStore(folderPathSelector);

	//  = folderPath.split('/')
	const links = useMemo(() => {
		const iLinks: ComponentProps<typeof CustomBreadcrumbs>['links'] = [];

		if (folderPath === '/') {
			iLinks.push({ name: '' });
			return iLinks;
		}

		folderPath.split('/').forEach((name /* , index, array */) => {
			iLinks.push({
				name,
			});
		});

		return iLinks;
	}, [folderPath]);

	return <CustomBreadcrumbs links={links} separator=">" sx={{ marginBottom: '22px' }} />;
};

// --------------------
const GridItems = () => {
	const goToFolder = useMainStore(goToFolderSelector);

	const folderPath = useMainStore(folderPathSelector);

	const {
		result: { data },
	} = useFindAppFileSuspense({ folderPath });

	return data.appFiles.map((appFile) => {
		if (appFile.mimeType === 'folder') {
			return (
				<FileManagerFolderItem
					onDoubleClick={() => {
						goToFolder(appFile.path);
					}}
					key={appFile.objectId}
					folder={appFolderData(appFile)}
					selected={/* selected.includes(folder.id) */ false}
					onSelect={() => {
						// return onSelectItem(folder.id);
					}}
					onDelete={() => {
						// return onDeleteItem(folder.id);
					}}
					sx={{ maxWidth: '270px' }}
				/>
			);
		}

		return (
			<FileManagerFileItem
				key={appFile.objectId}
				file={appFileData(appFile)}
				selected={/* selected.includes(file.id) */ false}
				onSelect={() => {
					// return onSelectItem(file.id);
				}}
				onDelete={() => {
					// return onDeleteItem(file.id);
				}}
				sx={{ maxWidth: '270px' }}
			/>
		);
	});
};

const GridSkeleton = () => {
	return Array.from({ length: 8 }).map(() => {
		return <ItemSkeleton key={nanoid()} />;
	});
};

const ItemSkeleton = () => {
	return <Skeleton variant="rounded" height="170px" />;
};
