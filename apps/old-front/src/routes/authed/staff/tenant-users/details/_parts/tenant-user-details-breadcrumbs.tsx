import capitalize from 'lodash/capitalize';

import { CustomBreadcrumbs } from '#app/components/custom-breadcrumbs/custom-breadcrumbs.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

type TenantUserDetailsBreadcrumbsProps = {
	title: string;
	action?: React.ReactNode;
};

export const TenantUserDetailsBreadcrumbs = ({
	action,
	title,
}: TenantUserDetailsBreadcrumbsProps) => {
	const { t } = useTranslate();

	return (
		<CustomBreadcrumbs
			heading={title}
			links={[
				{ name: capitalize(t('tenant-users')) },
				{ name: capitalize(t('details')) },
			]}
			action={action}
			sx={{ mb: { xs: 3, md: 5 } }}
		/>
	);
};
