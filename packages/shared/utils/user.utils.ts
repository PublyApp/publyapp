import _ from 'lodash';

type IPerson = {
	firstName?: string;
	lastName?: string;
};

/**
 * get user full name
 */
export const getUserFullName = (person: IPerson): string => {
	const lastName = _.trim(person.lastName || '');
	const firstName = _.trim(person.firstName || '');
	const name = _.trim(`${firstName} ${lastName}`);
	return name;
};
