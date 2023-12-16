/* eslint-disable react/no-unused-prop-types */
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormHelperText from '@mui/material/FormHelperText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';

import useResponsive from '@/ui-react/hooks/useResponsive';

// import { useResponsive } from 'src/hooks/use-responsive';
// import { DateRangePickerProps } from './types';
// ----------------------------------------------------------------------

export type DateRangePickerProps = {
	startDate: Date | null;
	endDate: Date | null;
	onChangeStartDate: (newValue: Date | null) => void;
	onChangeEndDate: (newValue: Date | null) => void;
	//
	open: boolean;
	onOpen?: VoidFunction;
	onClose: VoidFunction;
	onReset?: VoidFunction;
	//
	selected?: boolean;
	error?: boolean;
	//
	label?: string;
	shortLabel?: string;
	//
	title?: string;
	variant?: 'calendar' | 'input';
	//
	setStartDate?: React.Dispatch<React.SetStateAction<Date | null>>;
	setEndDate?: React.Dispatch<React.SetStateAction<Date | null>>;
};

// ----------------------------------------------------------------------

const CustomDateRangePicker = ({
	title = 'Select date range',
	variant = 'input',
	//
	startDate,
	endDate,
	//
	onChangeStartDate,
	onChangeEndDate,
	//
	open,
	onClose,
	//
	error,
}: DateRangePickerProps) => {
	const mdUp = useResponsive('up', 'md');

	const isCalendarView = variant === 'calendar';

	return (
		<Dialog
			fullWidth
			maxWidth={isCalendarView ? false : 'xs'}
			open={open}
			onClose={onClose}
			PaperProps={{
				sx: {
					...(isCalendarView && {
						maxWidth: 720,
					}),
				},
			}}
		>
			<DialogTitle sx={{ pb: 2 }}>{title}</DialogTitle>

			<DialogContent
				sx={{
					...(isCalendarView &&
						mdUp && {
							overflow: 'unset',
						}),
				}}
			>
				<Stack
					justifyContent="center"
					spacing={isCalendarView ? 3 : 2}
					direction={isCalendarView && mdUp ? 'row' : 'column'}
					sx={{ pt: 1 }}
				>
					{isCalendarView ? (
						<>
							<Paper
								variant="outlined"
								sx={{
									borderRadius: 2,
									borderColor: 'divider',
									borderStyle: 'dashed',
								}}
							>
								<DateCalendar value={startDate} onChange={onChangeStartDate} />
							</Paper>

							<Paper
								variant="outlined"
								sx={{
									borderRadius: 2,
									borderColor: 'divider',
									borderStyle: 'dashed',
								}}
							>
								<DateCalendar value={endDate} onChange={onChangeEndDate} />
							</Paper>
						</>
					) : (
						<>
							<DatePicker label="Start date" value={startDate} onChange={onChangeStartDate} />

							<DatePicker label="End date" value={endDate} onChange={onChangeEndDate} />
						</>
					)}
				</Stack>

				{error && (
					<FormHelperText error sx={{ px: 2 }}>
						End date must be later than start date
					</FormHelperText>
				)}
			</DialogContent>

			<DialogActions>
				<Button variant="outlined" color="inherit" onClick={onClose}>
					Cancel
				</Button>

				<Button disabled={error} variant="contained" onClick={onClose}>
					Apply
				</Button>
			</DialogActions>
		</Dialog>
	);
};

export default CustomDateRangePicker;
