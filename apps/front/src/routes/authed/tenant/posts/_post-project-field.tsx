import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Field } from '~/components/field';
import QueryDisplay from '~/components/query-display';
import {
	toTenantProjectItems,
	type TenantProjectListItem,
} from '~/lib/query/tenant-projects';

import type { FindProjectsForTenantResponse } from '@org/client-ts/models/index';

/** The composer's project select. Today the select renders with no option
 * until the projects resolve, so every non-data state is that same select plus
 * the empty hint — pulled out of the drawer so its component stays readable. */
export const PostProjectField = ({
	projectsQuery,
}: {
	projectsQuery: UseQueryResult<FindProjectsForTenantResponse, Error>;
}) => {
	const { t } = useTranslation(['posts']);

	const renderField = (items: TenantProjectListItem[]) => (
		<>
			<Field.Select
				name="projectId"
				label={t('posts:project-label')}
				placeholder={t('posts:project-placeholder')}
				options={items.map((project) => ({
					value: project.id,
					label: project.name,
				}))}
			/>
			{items.length === 0 ? (
				<p className="text-muted-foreground text-xs">
					{t('posts:no-projects-yet')}
				</p>
			) : null}
		</>
	);

	return (
		<QueryDisplay
			query={projectsQuery}
			LoadingSlot={renderField([])}
			// A failed refetch keeps the last good data (TanStack v5 flips
			// `status: 'error'` without clearing `data`): the parent kept
			// rendering the loaded options, so the held envelope drives this
			// slot too. On a first-load failure `data` is undefined →
			// toTenantProjectItems(undefined) === [] → the same empty select
			// + hint.
			ErrorSlot={renderField(toTenantProjectItems(projectsQuery.data))}
			EmptySlot={renderField([])}
		>
			{({ data }) => renderField(toTenantProjectItems(data))}
		</QueryDisplay>
	);
};
