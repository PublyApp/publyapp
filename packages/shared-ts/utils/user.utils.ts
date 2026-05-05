import _ from 'lodash';

/**
 * get user full name
 */
export const getUserFullName = (person: unknown): string => {
	const getLastName = _.get(person, 'lastName', '');
	const getFirstName = _.get(person, 'firstName', '');

	const lastName = _.trim(!_.isString(getLastName) ? '' : getLastName);
	const firstName = _.trim(!_.isString(getFirstName) ? '' : getFirstName);
	const name = _.trim(`${firstName} ${lastName}`);
	return name;
};
