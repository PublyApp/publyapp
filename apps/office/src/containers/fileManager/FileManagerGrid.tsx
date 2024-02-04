/* eslint-disable @typescript-eslint/no-use-before-define */
import { Suspense, useRef } from 'react';

import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import { nanoid } from 'nanoid';

import { useFindAppFileSuspense } from '@devist/ui-react/lib/react-query/features/appFiles/appFile.hooks';

import type { AppFile } from '@/shared/types/db/appFile.types';

import FileManagerFileItem from '../../components/file-manager/FileManagerFileItem';
import FileManagerFolderItem from '../../components/file-manager/FileManagerFolderItem';
import { appFileData, appFolderData } from '../../components/file-manager/utils';

import useFileManager from './useFilManager';

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

const FileManagerGrid = (/* { table,  data, dataFiltered, onDeleteItem, onOpenConfirm }: Props */) => {
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

	return (
		<>
			<Box ref={containerRef}>
				{/* <Panel /> */}
				{/* <Breadcrumbs /> */}

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

export default FileManagerGrid;

// --------------------
// const Panel = () => {
// 	// const folderPath = useMainStore(folderPathSelector);
// 	// const getFolde
// 	const { folderPath } = useFileManager();

// 	const getFolderName = () => {
// 		const lastPath = _.last(folderPath.split('/'));

// 		if (!lastPath) {
// 			return 'root folder';
// 		}

// 		return lastPath;
// 	};

// 	return (
// 		<FileManagerPanel
// 			title={getFolderName()}
// 			sx={{ marginBottom: 0 }}
// 			// subTitle={`${
// 			// 	data.filter((item) => {
// 			// 		return item.type === 'folder';
// 			// 	}).length
// 			// } folders`}
// 			onOpen={/* newFolder.setTrue */ () => {}}
// 			// collapse={/* folders.value */ false}
// 			// onCollapse={/* folders.toggle */ () => {}}
// 		/>
// 	);
// };

const GRID_ITEM_MAX_WIDTH = '270px';

// --------------------
const GridItems = () => {
	// const goToFolder = useMainStore(goToFolderSelector);
	// const folderPath = useMainStore(folderPathSelector);
	// const [folderPath, setFolderPath] = useQueryParam('folderPath', withDefault(StringParam, '/'));
	const { folderPath, setFolderPath } = useFileManager();

	const {
		result: { data },
	} = useFindAppFileSuspense({ folderPath });

	return data.appFiles.map((appFile: AppFile) => {
		if (appFile.mimeType === 'folder') {
			return (
				<FileManagerFolderItem
					onDoubleClick={() => {
						setFolderPath(appFile.path);
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
					sx={{ maxWidth: GRID_ITEM_MAX_WIDTH }}
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
				sx={{ maxWidth: GRID_ITEM_MAX_WIDTH }}
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
