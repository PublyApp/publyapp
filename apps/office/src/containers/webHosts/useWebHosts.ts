import type { Dispatch, SetStateAction } from 'react';

import type { Row } from '@tanstack/react-table';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import type { WebHost } from '@shared/types/webHost.types';
import { useGetWebHosts } from '@ui-react/query/features/webHosts/webHost.hooks';
import { createSetter } from '@ui-react/zustand/utils';

import useTableQueryParams from '../../hooks/useTableQueryParams';

type WebHostStore = {
	editDialogOpen: boolean;
	dialogEditedRow: Row<WebHost> | undefined;
	toggleEditDialog: () => void;
	setDialogEditedRow: Dispatch<SetStateAction<Row<WebHost> | undefined>>;
};

const useWebHostsStore = create<WebHostStore>()(
	immer((set) => {
		return {
			editDialogOpen: false as boolean,
			dialogEditedRow: undefined,
			// ACTIONS
			toggleEditDialog: () => {
				set((state) => {
					// eslint-disable-next-line no-param-reassign
					state.editDialogOpen = !state.editDialogOpen; // ? because we are using zustand's  immer middleware
				});
			},
			setDialogEditedRow: createSetter<WebHostStore>(set, 'dialogEditedRow'),
		};
	}),
);

const useWebHosts = () => {
	const tableQueryParams = useTableQueryParams();
	const webHostsStore = useWebHostsStore();

	const getWebHostsReturn = useGetWebHosts({
		page: tableQueryParams.pagination.pageIndex + 1,
		pageSize: tableQueryParams.pagination.pageSize,
		sorting: tableQueryParams.sorting,
	});

	return {
		...tableQueryParams,
		...webHostsStore,
		getWebHostsReturn,
	};
};

export default useWebHosts;
