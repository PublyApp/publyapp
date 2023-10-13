import numeral from 'numeral';

const result = (format: string, key = '.00') => {
	const isInteger = format.includes(key);

	return isInteger ? format.replace(key, '') : format;
};

// ----------------------------------------------------------------------

type InputValue = string | number | null;

export const fNumber = (number: InputValue) => {
	return numeral(number).format();
};

export const fCurrency = (number: InputValue) => {
	const format = number ? numeral(number).format('$0,0.00') : '';

	return result(format, '.00');
};

export const fData = (number: InputValue) => {
	const format = number ? numeral(number).format('0.0 b') : '';

	return result(format, '.0');
};
