import { type RootState } from '../slices';
import Slice from '../utils/Slice';

type FileManagerSliceState = {
	folderPath: string;
};

type FileManagerSliceActions = {
	goToFolder: (path: string) => void;
	goToParent: () => void;
};

type FileManagerSliceContent = FileManagerSliceState & FileManagerSliceActions;

const defaultValues: FileManagerSliceState = {
	folderPath: '/',
};

const sliceName = 'fileManager' as const;

const fileManagerSlice = new Slice<FileManagerSliceContent, typeof sliceName>({
	name: sliceName,
	defaultValues,
	initializer: (set) => {
		return {
			// fileManager: {
			...defaultValues,
			goToFolder: (path) => {
				set((state) => {
					// eslint-disable-next-line no-param-reassign
					state.fileManager.folderPath = path;
				});
			},
			goToParent: () => {
				set((state) => {
					const splitted = state.fileManager.folderPath.split('/');
					splitted.pop();
					// eslint-disable-next-line no-param-reassign
					state.fileManager.folderPath = splitted.join('/');
				});
			},
			// },
		};
	},
	persistedFields: ['folderPath'],
});

export default fileManagerSlice;

// selectors
export const folderPathSelector = (state: RootState) => {
	return state.fileManager.folderPath;
};

export const goToFolderSelector = (state: RootState) => {
	return state.fileManager.goToFolder;
};

export const goToParentSelector = (state: RootState) => {
	return state.fileManager.goToParent;
};
