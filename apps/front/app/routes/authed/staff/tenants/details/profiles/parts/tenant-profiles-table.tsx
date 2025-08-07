import Card from '@mui/material/Card';
import _ from 'lodash';
import {
	createMRTColumnHelper,
	MaterialReactTable,
} from 'material-react-table';
import { useMemo } from 'react';
import { useParams } from 'react-router';
import type { TenantProfile } from '@/front/_mock/_tenant-profiles';
import { useMRTTable } from '@/front/hooks/use-mrt-table';
import { useFindTenantProfiles } from '@/front/lib/react-query/features/tenant/tenant.hooks';
import { TENANT_PROFILES_PERMISSIONS_ENUM } from '@/shared/lib/constants';

const columnHelper = createMRTColumnHelper<
	Record<string, unknown> & { permission: string }
>();

const ALL_PERMISSIONS = _.values(TENANT_PROFILES_PERMISSIONS_ENUM);

const TenantProfilesTable = () => {
	const { tenantId } = useParams();
	const { data: profiles, isPending } = useFindTenantProfiles({
		variables: {
			tenantId: _.toString(tenantId),
		},
		enabled: !!tenantId,
	});

	const profilesMap = useMemo(() => {
		const map = new Map<string, TenantProfile>();

		_.forEach(profiles, (profile) => {
			map.set(profile.objectId, profile);
		});

		return map;
	}, [profiles]);

	const columns = useMemo(() => {
		const columnsDefinition = [
			columnHelper.accessor('permission', {
				header: 'Permission',
				Cell: ({ cell }) => {
					return <>{cell.getValue()}</>;
				},
			}),
		];

		profilesMap.forEach((profile) => {
			columnsDefinition.push(
				columnHelper.accessor(profile.objectId, {
					header: profile.name,
					Cell: ({ cell, row }) => {
						return (
							<>
								{profilesMap.get(profile.objectId)?.permissions[
									row.original.permission
								]
									? 'Yes'
									: 'No'}
							</>
						);
					},
				}),
			);
		});
		return columnsDefinition;
	}, [profilesMap]);

	const rows = useMemo(() => {
		return _.map(ALL_PERMISSIONS, (permission: string) => {
			return {
				permission,
			};
		});
	}, []);

	const table = useMRTTable('default', {
		columns,
		data: rows,
		state: {
			isLoading: isPending,
		},
		// TODO: create a new preset
		enableRowSelection: false,
		enableSorting: false,
		enablePagination: false,
		enableBottomToolbar: false,
	});

	return (
		<Card sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
			<MaterialReactTable table={table} />
		</Card>
	);
};

export default TenantProfilesTable;
