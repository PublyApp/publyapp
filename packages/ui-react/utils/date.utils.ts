import { format, formatDistanceToNow, getTime, getYear, isSameDay, isSameMonth } from 'date-fns';

// ----------------------------------------------------------------------

type InputValue = Date | string | number | null | undefined;

export const fDate = (date: InputValue, newFormat?: string) => {
	const fm = newFormat || 'dd MMM yyyy';

	return date ? format(new Date(date), fm) : '';
};

export const fDateTime = (date: InputValue, newFormat?: string) => {
	const fm = newFormat || 'dd MMM yyyy p';

	return date ? format(new Date(date), fm) : '';
};

export const fTimestamp = (date: InputValue) => {
	return date ? getTime(new Date(date)) : '';
};

export const fToNow = (date: InputValue) => {
	return date
		? formatDistanceToNow(new Date(date), {
				addSuffix: true,
		  })
		: '';
};

// --------------------------------------------------------------------------------

export const shortDateLabel = (startDate: Date | null, endDate: Date | null) => {
	const getCurrentYear = new Date().getFullYear();

	const startDateYear = startDate ? getYear(startDate) : null;

	const endDateYear = endDate ? getYear(endDate) : null;

	const currentYear = getCurrentYear === startDateYear && getCurrentYear === endDateYear;

	const sameDay = startDate && endDate ? isSameDay(new Date(startDate), new Date(endDate)) : false;

	const sameMonth = startDate && endDate ? isSameMonth(new Date(startDate), new Date(endDate)) : false;

	if (currentYear) {
		if (sameMonth) {
			if (sameDay) {
				return fDate(endDate, 'dd MMM yy');
			}

			return `${fDate(startDate, 'dd')} - ${fDate(endDate, 'dd MMM yy')}`;
		}

		return `${fDate(startDate, 'dd MMM')} - ${fDate(endDate, 'dd MMM yy')}`;
	}

	return `${fDate(startDate, 'dd MMM yy')} - ${fDate(endDate, 'dd MMM yy')}`;
};
