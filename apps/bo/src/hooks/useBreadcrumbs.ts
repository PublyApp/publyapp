import { useEffect } from 'react';

import { Breadcrumb } from '../contexts/AppProvider';

import { useApp } from './useApp';

export const useBreadcrumbs = () => {
	const useBreadCrumbsEffect = (breadcrumbs: Breadcrumb[]) => {
		const { setBreadcrumbs } = useApp();

		useEffect(() => {
			setBreadcrumbs(breadcrumbs);

			return () => {
				setBreadcrumbs([]);
			};
		}, [breadcrumbs, setBreadcrumbs]);
	};

	return useBreadCrumbsEffect;
};
