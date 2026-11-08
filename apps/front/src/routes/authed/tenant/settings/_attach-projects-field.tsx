import { useTranslation } from 'react-i18next';
import { FieldCheckboxGroup } from '~/components/field/field-checkbox-group';
import QueryDisplay from '~/components/query-display';
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

	// Today the field renders with no option until the projects resolve, so
	// every non-data state is that same empty field (no visible change).
	const renderField = (options: { value: string; label: string }[]) => (
		<FieldCheckboxGroup
			name={name}
			label={t('attach-projects-title')}
			options={options}
		/>
	);
	const toFieldOptions = (result: Parameters<typeof toTenantProjectItems>[0]) =>
		toTenantProjectItems(result).map((project) => ({
			value: project.id,
			label: project.name,
		}));

	return (
		<div data-testid="attach-projects-field">
			<p>{t('attach-projects-title')}</p>
			<p className="text-muted-foreground text-xs">
				{t('attach-projects-none-hint')}
			</p>
			<QueryDisplay
				query={projectsQuery}
				variant="inline"
				LoadingSlot={renderField([])}
				// A failed refetch keeps the last good data (TanStack v5 flips
				// `status: 'error'` without clearing `data`): the parent kept
				// rendering the loaded options, so the held envelope drives this
				// slot too. On a first-load failure `data` is undefined →
				// toTenantProjectItems(undefined) === [] → the same empty field.
				ErrorSlot={renderField(toFieldOptions(projectsQuery.data))}
				EmptySlot={renderField([])}
			>
				{({ data }) => renderField(toFieldOptions(data))}
			</QueryDisplay>
		</div>
	);
};
