import { useCallback, useState } from 'react';

import { Button, InputAdornment, Stack, TextField } from '@mui/material';

import usePopover from '@/office/hooks/usePopover';
import Iconify from '@/ui-react/components/Iconify';
import Label from '@/ui-react/components/Label';
import { type IFileFilterValue } from '@/ui-react/types/file';
import { shortDateLabel } from '@/ui-react/utils/date.utils';

import { defaultFilters, FILE_TYPE_OPTIONS, type Props } from './FileManagerFilters';

export const FileManagerFilters = (
	_props: // onCloseDateRange,
	// onOpenDateRange,
	// filters,
	// onFilters,
	// dateError,
	// typeOptions,
	Props,
) => {
	const dateRangeState = useBoolean();

	const openDateRange = dateRangeState.value;

	const onOpenDateRange = dateRangeState.setTrue;

	const [filters, setFilters] = useState(defaultFilters);

	const handleFilters = useCallback((name: string, value: IFileFilterValue) => {
		// table.onResetPage();
		setFilters((prevState) => {
			return {
				...prevState,
				[name]: value,
			};
		});
	}, []);

	const onFilters = handleFilters;

	const dateError = false;
	const typeOptions = FILE_TYPE_OPTIONS;

	const popover = usePopover();

	const renderLabel = filters.type.length ? filters.type.slice(0, 2).join(',') : 'All type';

	const handleFilterName = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			onFilters('name', event.target.value);
		},
		[onFilters],
	);

	const handleFilterStartDate = useCallback(
		(newValue: Date | null) => {
			onFilters('startDate', newValue);
		},
		[onFilters],
	);

	const handleFilterEndDate = useCallback(
		(newValue: Date | null) => {
			onFilters('endDate', newValue);
		},
		[onFilters],
	);

	const handleFilterType = useCallback(
		(newValue: string) => {
			const checked = filters.type.includes(newValue)
				? filters.type.filter((value) => {
						return value !== newValue;
				  })
				: [...filters.type, newValue];
			onFilters('type', checked);
		},
		[filters.type, onFilters],
	);

	// const handleResetType = useCallback(() => {
	// 	popover.onClose();
	// 	onFilters('type', []);
	// }, [onFilters, popover]);
	const renderFilterName = (
		<TextField
			value={filters.name}
			onChange={handleFilterName}
			placeholder="Search..."
			InputProps={{
				startAdornment: (
					<InputAdornment position="start">
						<Iconify icon="eva:search-fill" sx={{ color: 'text.disabled' }} />
					</InputAdornment>
				),
			}}
			sx={{
				width: { xs: 1, md: 260 },
			}}
		/>
	);

	const renderFilterType = (
		<>
			<Button
				color="inherit"
				// onClick={popover.onOpen}
				endIcon={
					<Iconify
						icon={popover.open ? 'eva:arrow-ios-upward-fill' : 'eva:arrow-ios-downward-fill'}
						// icon={false ? 'eva:arrow-ios-upward-fill' : 'eva:arrow-ios-downward-fill'}
						sx={{ ml: -0.5 }}
					/>
				}
			>
				{renderLabel}
				{filters.type.length > 2 && (
					<Label color="info" sx={{ ml: 1 }}>
						+{filters.type.length - 2}
					</Label>
				)}
			</Button>

			{/* <CustomPopover open={popover.open} onClose={popover.onClose} sx={{ p: 2.5 }}>
                <Stack spacing={2.5}>
                    <Box
                        gap={1}
                        display="grid"
                        gridTemplateColumns={{
                            xs: 'repeat(2, 1fr)',
                            sm: 'repeat(4, 1fr)',
                        }}
                    >
                        {typeOptions.map((type) => {
                            const selected = filters.type.includes(type);

                            return (
                                <CardActionArea
                                    key={type}
                                    onClick={() => {
                                        return handleFilterType(type);
                                    }}
                                    sx={{
                                        p: 1,
                                        borderRadius: 1,
                                        cursor: 'pointer',
                                        border: (theme) => {
                                            return `solid 1px ${alpha(theme.palette.grey[500], 0.08)}`;
                                        },
                                        ...(selected && {
                                            bgcolor: 'action.selected',
                                        }),
                                    }}
                                >
                                    <Stack spacing={1} direction="row" alignItems="center">
                                        <FileThumbnail file={type} />
                                        <Typography variant={selected ? 'subtitle2' : 'body2'}>{type}</Typography>
                                    </Stack>
                                </CardActionArea>
                            );
                        })}
                    </Box>

                    <Stack spacing={1.5} direction="row" alignItems="center" justifyContent="flex-end">
                        <Button variant="outlined" color="inherit" onClick={handleResetType}>
                            Clear
                        </Button>

                        <Button variant="contained" onClick={popover.onClose}>
                            Apply
                        </Button>
                    </Stack>
                </Stack>
            </CustomPopover> */}
		</>
	);

	const renderFilterDate = (
		<>
			<Button
				color="inherit"
				onClick={onOpenDateRange}
				endIcon={
					<Iconify
						icon={openDateRange ? 'eva:arrow-ios-upward-fill' : 'eva:arrow-ios-downward-fill'}
						sx={{ ml: -0.5 }}
					/>
				}
			>
				{!!filters.startDate && !!filters.endDate ? shortDateLabel(filters.startDate, filters.endDate) : 'Select Date'}
			</Button>

			{/* <CustomDateRangePicker
                variant="calendar"
                startDate={filters.startDate}
                endDate={filters.endDate}
                onChangeStartDate={handleFilterStartDate}
                onChangeEndDate={handleFilterEndDate}
                open={openDateRange}
                onClose={onCloseDateRange}
                selected={!!filters.startDate && !!filters.endDate}
                error={dateError}
            /> */}
		</>
	);

	return (
		<Stack
			spacing={1}
			direction={{ xs: 'column', md: 'row' }}
			alignItems={{ xs: 'flex-end', md: 'center' }}
			sx={{ width: 1 }}
		>
			{renderFilterName}

			<Stack spacing={1} direction="row" alignItems="center" justifyContent="flex-end" flexGrow={1}>
				{renderFilterDate}

				{renderFilterType}
			</Stack>
		</Stack>
	);
};
