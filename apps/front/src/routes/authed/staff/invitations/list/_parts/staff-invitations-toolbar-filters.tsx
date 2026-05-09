import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import TextField from '@mui/material/TextField';
import { varAlpha } from 'minimal-shared/utils';
import { type SyntheticEvent, useId } from 'react';

import { useTranslate } from '#app/hooks/use-translate.ts';
import { SelectionLockedControl } from '#app/lib/mrt-table/components/selection-locked-control.tsx';

import type { StaffInvitationStatusOption } from './staff-invitation-status';

type StaffInvitationsToolbarFiltersProps = {
	isSelectionMode: boolean;
	selectionModeDisabledReason: string;
	statusOptions: StaffInvitationStatusOption[];
	selectedStatusOptions: StaffInvitationStatusOption[];
	statusFilterLength: number;
	onStatusChange: (
		event: SyntheticEvent,
		selectedOptions: StaffInvitationStatusOption[],
	) => void;
};

export const StaffInvitationsToolbarFilters = ({
	isSelectionMode,
	selectionModeDisabledReason,
	statusOptions,
	selectedStatusOptions,
	statusFilterLength,
	onStatusChange,
}: StaffInvitationsToolbarFiltersProps) => {
	const { t } = useTranslate();
	const statusTooltipId = useId();

	return (
		<SelectionLockedControl
			isSelectionMode={isSelectionMode}
			disabledReason={selectionModeDisabledReason}
			describeChild
			tooltipId={statusTooltipId}
		>
			<Box component="span">
				<Autocomplete
					multiple
					disableCloseOnSelect
					size="small"
					options={statusOptions}
					value={selectedStatusOptions}
					onChange={onStatusChange}
					disabled={isSelectionMode}
					isOptionEqualToValue={(option, value) => option.value === value.value}
					getOptionLabel={(option) => option.label}
					renderInput={(params) => (
						<TextField
							{...params}
							placeholder={
								statusFilterLength === 0 ? t('all-statuses') : undefined
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
							// Keep MRT toolbar filters anchored while rows change layouts.
							placement: 'bottom-start',
						},
						paper: {
							sx: {
								width: 280,
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
						minWidth: 260,
						'& .MuiAutocomplete-tag': {
							maxWidth: 120,
						},
					}}
				/>
			</Box>
		</SelectionLockedControl>
	);
};
