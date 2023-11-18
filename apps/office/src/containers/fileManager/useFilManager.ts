import { StringParam, useQueryParam, withDefault } from 'use-query-params';

const useFileManager = () => {
	const [folderPath, setFolderPath] = useQueryParam('folderPath', withDefault(StringParam, '/'));

	return {
		folderPath,
		setFolderPath,
	};
};

export default useFileManager;
