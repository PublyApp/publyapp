import get from 'lodash/get';
import isString from 'lodash/isString';
import trim from 'lodash/trim';

/**
 * get user full name
 */
export const getUserFullName = (person: unknown): string => {
	const getLastName = get(person, 'lastName', '');
	const getFirstName = get(person, 'firstName', '');

	const lastName = trim(!isString(getLastName) ? '' : getLastName);
	const firstName = trim(!isString(getFirstName) ? '' : getFirstName);
	const name = trim(`${firstName} ${lastName}`);
	return name;
};
