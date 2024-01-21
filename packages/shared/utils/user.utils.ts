type IPerson = {
	firstName?: string;
	lastName?: string;
};

/**
 * get user full name
 */
export const getUserFullName = (person: IPerson): string => {
	const lastName = person.lastName || '';
	const firstName = person.firstName || '';
	const name = firstName ? `${firstName} ${lastName}` : lastName;
	return name;
};
