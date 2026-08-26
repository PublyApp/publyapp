import { useTranslation } from 'react-i18next';

export type VisibleInProject = { id: string; label: string };

/** Spec §2: empty attachment set = visible everywhere; otherwise names.
 * Unknown ids (project deleted while still attached) degrade to the raw id
 * rather than silently disappearing. */
export const IntegrationsVisibleIn = ({
	projectIds,
	projects,
}: {
	projectIds: string[];
	projects: VisibleInProject[];
}) => {
	const { t } = useTranslation(['settings']);

	if (projectIds.length === 0) {
		return <span>{t('visible-in-all-projects')}</span>;
	}

	const names = projectIds
		.map((id) => projects.find((project) => project.id === id)?.label ?? id)
		.join(', ');

	return <span>{t('visible-in-projects', { names })}</span>;
};
