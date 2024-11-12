import _ from 'lodash';

import PageHeader from '@/office/components/PageHeader';
import useTranslate from '@/ui-react/hooks/useTranslate';

const TenantsListHeader = () => {
	const { t } = useTranslate();

	return (
		<PageHeader
			heading={<PageHeader.Heading>{t('list-of-items', { items: _.toLower(`${t('user')}s`) })}</PageHeader.Heading>}
			breadcrumbs={
				<PageHeader.Breadcrumbs
					links={[
						{
							name: 'Dashboard',
							// href: BO_PATH_NAMES.dashboard.root
						},
						{
							name: `${t('user')}s`,
							// href: BO_PATH_NAMES.dashboard.posts.root,
						},
						{ name: t('list') },
					]}
				/>
			}
		/>
	);
};

export default TenantsListHeader;
