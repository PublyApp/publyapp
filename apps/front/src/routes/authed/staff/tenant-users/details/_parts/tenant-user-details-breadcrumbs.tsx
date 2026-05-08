import capitalize from 'lodash/capitalize';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { CustomBreadcrumbs } from '#app/components/custom-breadcrumbs/custom-breadcrumbs.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

type TenantUserDetailsBreadcrumbsProps = {
	title: string;
};

export const TenantUserDetailsBreadcrumbs = ({
	title,
}: TenantUserDetailsBreadcrumbsProps) => {
	const { t } = useTranslate();

	return (
		<CustomBreadcrumbs
			heading={title}
			links={[
				{
					name: capitalize(t('tenants')),
					href: FRONT_PATH_NAMES.staff.tenants.root,
				},
				{ name: capitalize(t('tenant-users')) },
				{ name: capitalize(t('details')) },
			]}
			sx={{ mb: { xs: 3, md: 5 } }}
		/>
	);
};
