import _ from 'lodash';

export const slugify = (str?: string) => {
	return _.kebabCase(str);
};

export const toPascalCase = (str: string) => {
	if (!str) return '';

	return (
		str
			.trim()
			// Add space before capital letters (for camelCase)
			.replace(/([A-Z])/g, ' $1')
			// Split into words by non-alphanumeric characters
			.split(/[^a-zA-Z0-9]+/)
			.filter((word) => {
				return word.length > 0;
			})
			.map((word) => {
				return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
			})
			.join('')
	);
};

export const makePath = (...params: string[]) => {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	const _params: string[] = [];

	params?.forEach((param) => {
		if (param?.length <= 0 || param === '/') {
			return;
		}

		_params.push(param);
	});

	let path = _params.join('/').replace(/\/{2,}/g, '/');

	if (!path.startsWith('/')) {
		path = `/${path}`;
	}

	return path;
};

export const getLastPath = (path: string, n = 1) => {
	const last = _.takeRight(path.split('/'), n).join('/');
	return last;
};
