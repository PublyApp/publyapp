// ----------------------------------------------------------------------

import get from 'lodash/get';
import isArray from 'lodash/isArray';
import isEmpty from 'lodash/isEmpty';
import map from 'lodash/map';

export const flattenArray = <T>(list: T[], key = 'children'): T[] => {
	let children: T[] = [];

	const flatten = map(list, (item) => {
		const property = get(item, key);
		if (isArray(property) && !isEmpty(property)) {
			children = [...children, ...property];
		}

		return item;
	});

	return flatten?.concat(
		children.length ? flattenArray(children, key) : children,
	);
};
