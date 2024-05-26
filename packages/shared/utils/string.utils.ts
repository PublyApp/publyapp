import _ from 'lodash';

export const slugify = (str?: string) => {
	return _.kebabCase(str);
};
