import { useMemo, type ComponentProps } from 'react';

import CustomBreadcrumbs from '@/office/components/CustomBreadcrumbs';
import { BO_PATH_NAMES } from '@/shared/lib/constants';

import useFileManager from './useFilManager';

const getFileManagerBreadcrumbURL = (folderPath: string) => {
	const url = new URL(window.location.origin);
	url.pathname = BO_PATH_NAMES.fileManager;
	const searchParams = new URLSearchParams();
	searchParams.set('folderPath', folderPath);
	url.search = decodeURIComponent(searchParams.toString());
	return url.toString();
};

// --------------------
const FileManagerBreadcrumbs = () => {
	// const folderPath = useMainStore(folderPathSelector);
	const { folderPath } = useFileManager();

	//  = folderPath.split('/')
	const links = useMemo(() => {
		const iLinks: ComponentProps<typeof CustomBreadcrumbs>['links'] = [
			{ name: '/', href: getFileManagerBreadcrumbURL('/') },
		];

		folderPath.split('/').forEach((name, index, array) => {
			if (index < 1) return;

			iLinks.push({
				name,
				href: getFileManagerBreadcrumbURL(array.slice(0, index + 1).join('/')),
			});
		});

		return iLinks;
	}, [folderPath]);

	return <CustomBreadcrumbs links={links} /* separator=">" */ /* sx={{ marginBottom: '22px' }} */ />;
};

export default FileManagerBreadcrumbs;
