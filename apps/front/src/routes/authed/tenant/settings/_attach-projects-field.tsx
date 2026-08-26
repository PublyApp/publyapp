import { useTranslation } from 'react-i18next';
import { FieldCheckboxGroup } from '~/components/field/field-checkbox-group';
import {
	toTenantProjectItems,
	useTenantProjectsQuery,
} from '~/lib/query/tenant-projects';

/** Spec §3: checklist of the tenant's projects; none checked = visible
 * everywhere. FieldCheckboxGroup already binds to RHF through its own
 * Controller, so this wrapper only supplies the tenant project options and
 * the none-checked hint. */
export const AttachProjectsField = ({
	name,
	tenantId,
}: {
	name: string;
	tenantId: string;
}) => {
	const { t } = useTranslation(['settings']);
	const projectsQuery = useTenantProjectsQuery({ tenantId });
	const options = toTenantProjectItems(projectsQuery.data).map((project) => ({
		value: project.id,
		label: project.name,
	}));

	return (
		<div data-testid="attach-projects-field">
			<p>{t('attach-projects-title')}</p>
			<p className="text-muted-foreground text-xs">
				{t('attach-projects-none-hint')}
			</p>
			<FieldCheckboxGroup
				name={name}
				label={t('attach-projects-title')}
				options={options}
			/>
		</div>
	);
};
