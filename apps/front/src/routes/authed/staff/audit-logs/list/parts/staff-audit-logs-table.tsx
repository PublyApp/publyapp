import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import _ from 'lodash';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
	type MRT_SortingState,
} from 'material-react-table';
import { useEffect, useMemo, useState } from 'react';

import type { AuditLogListItem } from '@org/client-ts/src/models';
import {
	DEFAULT_PAGE_SIZE,
	FRONT_PATH_NAMES,
} from '@org/shared-ts/lib/constants';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { useMRTTable } from '#app/hooks/use-mrt-table.ts';
import { useTableQueryOptions } from '#app/hooks/use-table-query-options.tsx';
import { useTableState } from '#app/hooks/use-table-state.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import {
	useFindStaffAuditLogs,
	useGetStaffAuditLogActions,
} from '#app/lib/react-query/features/staff/staff-audit-log.hooks.ts';
import {
	type Dayjs,
	fDateTime,
	formatPatterns,
	fToNow,
} from '#app/utils/format-time.ts';

import { AuditLogsExportButton } from './audit-logs-export-button';

type AuditLogRowData = {
	id: string;
	userName: string;
	userEmail: string;
	action: string;
	ipAddress: string;
	targetId: string;
	createdAt: Date | null;
};

const AuditLogRowDataMapper = (log: AuditLogListItem): AuditLogRowData => {
	return {
		id: log.id || '',
		userName: log.userName || '-',
		userEmail: log.userEmail || '-',
		action: log.action || '-',
		ipAddress: log.ipAddress || '-',
		targetId: log.targetId || '',
		createdAt: log.createdAt || null,
	};
};

const columnHelper = createMRTColumnHelper<AuditLogRowData>();

const defaultSorting: MRT_SortingState[number] = {
	desc: true,
	id: 'created_at',
};

const StaffAuditLogsTable = () => {
	const { t } = useTranslate();
	const [actionFilter, setActionFilter] = useState<string>('');
	const [startDate, setStartDate] = useState<Dayjs | null>(null);
	const [endDate, setEndDate] = useState<Dayjs | null>(null);

	const {
		handlePaginationChange,
		handleSortingChange,
		apiVariables,
		tableState,
		setNextCursor,
		hasNextPage,
		hasPreviousPage,
		resetCursorPagination,
	} = useTableState({
		defaultSorting,
		defaultPageSize: DEFAULT_PAGE_SIZE,
		paginationMode: 'cursor',
	});

	const startDateIso = startDate?.startOf('day').toISOString();
	const endDateIso = endDate?.endOf('day').toISOString();

	const auditLogsQuery = useFindStaffAuditLogs({
		variables: {
			cursor: apiVariables.cursor || undefined,
			limit: apiVariables.limit,
			sort: apiVariables.sort,
			action: actionFilter || undefined,
			startDate: startDateIso,
			endDate: endDateIso,
		},
	});

	const actionsQuery = useGetStaffAuditLogActions({});

	const { renderEmptyRowsFallback, queryState } = useTableQueryOptions({
		query: auditLogsQuery,
		emptyContent: {
			title: _.capitalize(
				t('no-items-found', {
					item: t('audit-logs'),
					ns: 'response-message',
				}),
			),
		},
		errorContent: {
			title: _.capitalize(
				t('error-loading-items', {
					item: t('audit-logs'),
					ns: 'response-message',
				}),
			),
		},
	});

	useEffect(() => {
		if (setNextCursor) {
			setNextCursor(auditLogsQuery.data?.nextCursor);
		}
	}, [auditLogsQuery.data?.nextCursor, setNextCursor]);

	const dataTable = useMemo(() => {
		return _.map(auditLogsQuery.data?.data, AuditLogRowDataMapper);
	}, [auditLogsQuery.data]);

	const columns = useMemo(() => {
		return [
			columnHelper.accessor('userName', {
				header: t('user'),
				Cell: UserCell,
				enableSorting: false,
				size: 220,
			}),
			columnHelper.accessor('action', {
				header: t('action'),
				Cell: ActionCell,
				enableSorting: false,
				size: 200,
			}),
			columnHelper.accessor('targetId', {
				header: t('target-id'),
				Cell: TargetIdCell,
				enableSorting: false,
				size: 160,
			}),
			columnHelper.accessor('ipAddress', {
				header: t('ip-address'),
				Cell: IpAddressCell,
				enableSorting: false,
				size: 140,
			}),
			columnHelper.accessor('createdAt', {
				id: 'created_at',
				header: t('created-at'),
				Cell: DateCell,
				size: 200,
			}),
			columnHelper.display({
				header: t('actions'),
				Cell: ActionsCell,
				size: 80,
			}),
		];
	}, [t]);

	const table = useMRTTable('minimal-cursor', {
		columns,
		data: dataTable,
		manualSorting: true,
		onSortingChange: handleSortingChange,
		state: {
			...tableState,
			...queryState,
			density: 'compact',
		},
		muiTablePaperProps: {
			sx: {
				flexGrow: 1,
			},
		},
		renderEmptyRowsFallback,
		meta: {
			handlePaginationChange,
			hasNextPage,
			hasPreviousPage,
			isPending: auditLogsQuery.isPending,
		},
	});

	const actionOptions = useMemo(() => {
		return actionsQuery.data?.actions ?? [];
	}, [actionsQuery.data]);

	return (
		<Box
			sx={{
				flexGrow: 1,
				display: 'flex',
				flexDirection: 'column',
				gap: 2,
				border: 'none',
			}}
		>
			<Box
				sx={{
					display: 'flex',
					justifyContent: 'flex-end',
					alignItems: 'center',
					gap: 2,
					flexWrap: 'wrap',
				}}
			>
				<DatePicker
					label={t('start-date')}
					value={startDate}
					onChange={(newValue) => {
						resetCursorPagination?.();
						setStartDate(newValue);
					}}
					format={formatPatterns.split.date}
					maxDate={endDate ?? undefined}
					slotProps={{
						textField: { size: 'small' },
						field: {
							clearable: true,
							onClear: () => {
								resetCursorPagination?.();
								setStartDate(null);
							},
						},
					}}
				/>

				<DatePicker
					label={t('end-date')}
					value={endDate}
					onChange={(newValue) => {
						resetCursorPagination?.();
						setEndDate(newValue);
					}}
					format={formatPatterns.split.date}
					minDate={startDate ?? undefined}
					slotProps={{
						textField: { size: 'small' },
						field: {
							clearable: true,
							onClear: () => {
								resetCursorPagination?.();
								setEndDate(null);
							},
						},
					}}
				/>

				<FormControl size="small" sx={{ minWidth: 240 }}>
					<InputLabel id="audit-logs-action-filter-label">
						{t('action')}
					</InputLabel>
					<Select
						labelId="audit-logs-action-filter-label"
						label={t('action')}
						value={actionFilter}
						onChange={(event) => {
							resetCursorPagination?.();
							setActionFilter(event.target.value);
						}}
						displayEmpty
						renderValue={(selected) => {
							if (!selected) {
								return t('all');
							}
							return selected;
						}}
					>
						<MenuItem value="">{t('all')}</MenuItem>
						{actionOptions.map((action) => (
							<MenuItem key={action} value={action}>
								{action}
							</MenuItem>
						))}
					</Select>
				</FormControl>

				<AuditLogsExportButton
					actionFilter={actionFilter}
					startDate={startDateIso}
					endDate={endDateIso}
				/>
			</Box>

			<MaterialReactTable table={table} />
		</Box>
	);
};

export default StaffAuditLogsTable;

const UserCell: MRT_ColumnDef<AuditLogRowData, string>['Cell'] = (props) => {
	const userName = props.cell.getValue();
	const userEmail = props.row.original.userEmail;

	return (
		<ListItemText
			primary={userName || '-'}
			secondary={userEmail || '-'}
			slotProps={{
				primary: { noWrap: true },
				secondary: {
					noWrap: true,
					sx: { color: 'text.disabled', fontSize: '0.75rem' },
				},
			}}
		/>
	);
};

const ActionCell: MRT_ColumnDef<AuditLogRowData, string>['Cell'] = (props) => {
	const action = props.cell.getValue();

	return (
		<Typography
			variant="body2"
			sx={{
				fontFamily: 'monospace',
				fontSize: '0.8rem',
			}}
		>
			{action || '-'}
		</Typography>
	);
};

const TargetIdCell: MRT_ColumnDef<AuditLogRowData, string>['Cell'] = (
	props,
) => {
	const targetId = props.cell.getValue();

	if (!targetId) {
		return (
			<Typography variant="body2" sx={{ color: 'text.disabled' }}>
				-
			</Typography>
		);
	}

	return (
		<Tooltip title={targetId} placement="top" arrow>
			<Typography
				variant="body2"
				sx={{
					fontFamily: 'monospace',
					fontSize: '0.75rem',
					color: 'text.secondary',
					maxWidth: 140,
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'nowrap',
				}}
			>
				{targetId}
			</Typography>
		</Tooltip>
	);
};

const IpAddressCell: MRT_ColumnDef<AuditLogRowData, string>['Cell'] = (
	props,
) => {
	const ipAddress = props.cell.getValue();

	return (
		<Typography
			variant="body2"
			sx={{
				fontFamily: 'monospace',
				fontSize: '0.8rem',
				color: 'text.secondary',
			}}
		>
			{ipAddress || '-'}
		</Typography>
	);
};

const DateCell: MRT_ColumnDef<AuditLogRowData, Date | null>['Cell'] = (
	props,
) => {
	const dateValue = props.cell.getValue();

	if (!dateValue) {
		return <Typography variant="body2">-</Typography>;
	}

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column' }}>
			<Typography variant="body2">{fDateTime(dateValue)}</Typography>
			<Typography variant="caption" sx={{ color: 'text.secondary' }}>
				{fToNow(dateValue)}
			</Typography>
		</Box>
	);
};

const ActionsCell: MRT_ColumnDef<AuditLogRowData>['Cell'] = (props) => {
	const { t } = useTranslate();
	const logId = props.row.original.id;

	return (
		<Tooltip title={t('view-details')} placement="top" arrow>
			<IconButton
				color="default"
				LinkComponent={RouterLink}
				href={FRONT_PATH_NAMES.staff.auditLogs.details(logId)}
				size="small"
				aria-label={t('view-details')}
			>
				<Iconify icon="solar:eye-bold" />
			</IconButton>
		</Tooltip>
	);
};
