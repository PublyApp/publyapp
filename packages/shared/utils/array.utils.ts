// ----------------------------------------------------------------------

import _ from 'lodash';

export const flattenArray = <T>(list: T[], key = 'children'): T[] => {
	let children: T[] = [];

	const flatten = _.map(list, (item) => {
		const property = _.get(item, key);
		if (_.isArray(property) && !_.isEmpty(property)) {
			children = [...children, ...property];
		}

		return item;
	});

	return flatten?.concat(
		children.length ? flattenArray(children, key) : children,
	);
};
