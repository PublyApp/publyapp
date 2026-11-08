import { useTranslation } from 'react-i18next';
import QueryDisplay from '~/components/query-display';
import {
	toTenantProjectItems,
	type useTenantProjectsQuery,
} from '~/lib/query/tenant-projects';

export type VisibleInProject = { id: string; label: string };

/** Spec §2: empty attachment set = visible everywhere; otherwise names.
 * Unknown ids (project deleted while still attached) degrade to the raw id
 * rather than silently disappearing. */
export const IntegrationsVisibleIn = ({
	projectIds,
	query,
}: {
	projectIds: string[];
	query: ReturnType<typeof useTenantProjectsQuery>;
}) => {
	const { t } = useTranslation(['settings']);

	if (projectIds.length === 0) {
		return <span>{t('visible-in-all-projects')}</span>;
	}

	const renderNames = (projects: VisibleInProject[]) =>
		projectIds
			.map((id) => projects.find((project) => project.id === id)?.label ?? id)
			.join(', ');
	const projects = toTenantProjectItems(query.data).map((project) => ({
		id: project.id,
		label: project.name,
	}));

	return (
		<QueryDisplay
			query={query}
			variant="discreet"
			LoadingSlot={<span>{renderNames([])}</span>}
		>
			<span>{t('visible-in-projects', { names: renderNames(projects) })}</span>
		</QueryDisplay>
	);
};
