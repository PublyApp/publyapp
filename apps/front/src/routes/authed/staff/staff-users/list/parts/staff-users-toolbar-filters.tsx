import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import { varAlpha } from 'minimal-shared/utils';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { SelectionLockedControl } from '#app/lib/mrt-table/components/selection-locked-control.tsx';
import type { StaffUserStatusFilter } from '#app/lib/react-query/features/staff/staff-user.hooks.ts';

export type StaffUserStatusFilterOption = {
	label: string;
	value: StaffUserStatusFilter;
};

type StaffUsersToolbarFiltersProps = {
	searchTooltipId: string;
	statusTooltipId: string;
	isSelectionMode: boolean;
	disabledReason: string;
	globalFilter: string;
	statusFilter: StaffUserStatusFilter[];
	statusOptions: StaffUserStatusFilterOption[];
	onSearchChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
	onStatusChange: (
		event: React.SyntheticEvent,
		selectedOptions: StaffUserStatusFilterOption[],
	) => void;
};

const StaffUsersToolbarFilters = ({
	searchTooltipId,
	statusTooltipId,
	isSelectionMode,
	disabledReason,
	globalFilter,
	statusFilter,
	statusOptions,
	onSearchChange,
	onStatusChange,
}: StaffUsersToolbarFiltersProps) => {
	const { t } = useTranslate();

	return (
		<>
			<SelectionLockedControl
				isSelectionMode={isSelectionMode}
				disabledReason={disabledReason}
				describeChild
				tooltipId={searchTooltipId}
			>
				<Box component="span">
					<TextField
						size="small"
						placeholder={t('search-by-email-or-name')}
						value={globalFilter}
						onChange={onSearchChange}
						disabled={isSelectionMode}
						slotProps={{
							input: {
								startAdornment: (
									<InputAdornment position="start">
										<Iconify icon="eva:search-fill" />
									</InputAdornment>
								),
								'aria-label': t('search'),
							},
						}}
						sx={{ minWidth: 260 }}
					/>
				</Box>
			</SelectionLockedControl>

			<SelectionLockedControl
				isSelectionMode={isSelectionMode}
				disabledReason={disabledReason}
				describeChild
				tooltipId={statusTooltipId}
			>
				<Box component="span">
					<Autocomplete
						multiple
						disableCloseOnSelect
						size="small"
						options={statusOptions}
						value={statusOptions.filter((option) =>
							statusFilter.includes(option.value),
						)}
						onChange={onStatusChange}
						disabled={isSelectionMode}
						isOptionEqualToValue={(option, value) =>
							option.value === value.value
						}
						getOptionLabel={(option) => option.label}
						renderInput={(params) => (
							<TextField
								{...params}
								placeholder={
									statusFilter.length === 0 ? t('all-statuses') : undefined
								}
								slotProps={{
									input: {
										...params.InputProps,
										startAdornment: (
											<>
												<Box
													component="span"
													sx={{
														color: 'text.secondary',
														typography: 'body2',
														whiteSpace: 'nowrap',
														mr: 1,
														display: 'inline-flex',
														alignItems: 'center',
														alignSelf: 'center',
														minHeight: 24,
													}}
												>
													{t('status')}:
												</Box>
												{params.InputProps.startAdornment}
											</>
										),
									},
								}}
							/>
						)}
						renderOption={(props, option, { selected }) => {
							const { key, ...optionProps } = props;

							return (
								<Box
									component="li"
									key={key}
									{...optionProps}
									sx={(theme) => ({
										'&.Mui-focused': {
											backgroundColor: varAlpha(
												theme.vars.palette.grey['500Channel'],
												0.08,
											),
										},
										'&[aria-selected="true"]': {
											backgroundColor: varAlpha(
												theme.vars.palette.primary.mainChannel,
												0.08,
											),
										},
										'&[aria-selected="true"].Mui-focused': {
											backgroundColor: varAlpha(
												theme.vars.palette.primary.mainChannel,
												0.12,
											),
										},
									})}
								>
									<Checkbox checked={selected} sx={{ mr: 1 }} />
									{option.label}
								</Box>
							);
						}}
						slotProps={{
							popper: {
								// MRT loading/skeleton row transitions can make centered Popper menus
								// look shifted. Anchor filter menus to the field's lower-left edge.
								placement: 'bottom-start',
								sx: {
									width: '280px !important',
								},
							},
							paper: {
								sx: {
									width: 1,
								},
							},
							chip: {
								sx: (theme) => ({
									backgroundColor: varAlpha(
										theme.vars.palette.grey['500Channel'],
										0.16,
									),
									color: 'text.secondary',
									'&:hover': {
										backgroundColor: varAlpha(
											theme.vars.palette.grey['500Channel'],
											0.24,
										),
									},
								}),
							},
						}}
						sx={{
							'& .MuiAutocomplete-tag': {
								maxWidth: 120,
							},
						}}
					/>
				</Box>
			</SelectionLockedControl>
		</>
	);
};

export default StaffUsersToolbarFilters;
