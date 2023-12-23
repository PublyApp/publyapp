import { useMemo, type ComponentProps } from 'react';

import CustomBreadcrumbs from '@/office/components/CustomBreadcrumbs';

import useFileManager from './useFilManager';

// --------------------
const FileManagerBreadcrumbs = () => {
	// const folderPath = useMainStore(folderPathSelector);
	const { folderPath } = useFileManager();

	//  = folderPath.split('/')
	const links = useMemo(() => {
		const iLinks: ComponentProps<typeof CustomBreadcrumbs>['links'] = [{ name: '/' }];

		// if (folderPath === '/') {
		// 	iLinks.push({ name: '/' });
		// 	return iLinks;
		// }

		folderPath.split('/').forEach((name, index /* ,  array */) => {
			if (index < 1) return;
			iLinks.push({
				name,
			});
		});

		return iLinks;
	}, [folderPath]);

	return <CustomBreadcrumbs links={links} /* separator=">" */ sx={{ marginBottom: '22px' }} />;
};

export default FileManagerBreadcrumbs;
