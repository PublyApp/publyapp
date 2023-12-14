import { buttonClasses } from '@mui/material/Button';
import type { Theme } from '@mui/material/styles';

import Iconify from '@/ui-react/components/Iconify';

// components

// ----------------------------------------------------------------------

const dateList = [
	'DatePicker',
	'DateTimePicker',
	'StaticDatePicker',
	'DesktopDatePicker',
	'DesktopDateTimePicker',
	//
	'MobileDatePicker',
	'MobileDateTimePicker',
];

const timeList = ['TimePicker', 'MobileTimePicker', 'StaticTimePicker', 'DesktopTimePicker'];

const switchIcon = () => {
	return <Iconify icon="eva:chevron-down-fill" width={24} />;
};

const leftIcon = () => {
	return <Iconify icon="eva:arrow-ios-back-fill" width={24} />;
};

const rightIcon = () => {
	return <Iconify icon="eva:arrow-ios-forward-fill" width={24} />;
};

const calendarIcon = () => {
	return <Iconify icon="solar:calendar-mark-bold-duotone" width={24} />;
};

const clockIcon = () => {
	return <Iconify icon="solar:clock-circle-outline" width={24} />;
};

const desktopTypes = dateList.reduce((result: Record<string, any>, currentValue) => {
	// eslint-disable-next-line no-param-reassign
	result[`Mui${currentValue}`] = {
		defaultProps: {
			slots: {
				openPickerIcon: calendarIcon,
				leftArrowIcon: leftIcon,
				rightArrowIcon: rightIcon,
				switchViewIcon: switchIcon,
			},
		},
	};

	return result;
}, {});

const timeTypes = timeList.reduce((result: Record<string, any>, currentValue) => {
	// eslint-disable-next-line no-param-reassign
	result[`Mui${currentValue}`] = {
		defaultProps: {
			slots: {
				openPickerIcon: clockIcon,
				rightArrowIcon: rightIcon,
				switchViewIcon: switchIcon,
			},
		},
	};

	return result;
}, {});

export const DatePicker = (theme: Theme) => {
	return {
		MuiPickersLayout: {
			styleOverrides: {
				root: {
					'& .MuiPickersLayout-actionBar': {
						[`& .${buttonClasses.root}:last-of-type`]: {
							backgroundColor: theme.palette.text.primary,
							color: theme.palette.mode === 'light' ? theme.palette.common.white : theme.palette.grey[800],
						},
					},
				},
			},
		},

		// Date
		...desktopTypes,

		// Time
		...timeTypes,
	};
};
