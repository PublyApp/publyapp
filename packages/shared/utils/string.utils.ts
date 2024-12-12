import _ from 'lodash';

export const slugify = (str?: string) => {
	return _.kebabCase(str);
};

export const makePath = (...params: string[]) => {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	const _params: string[] = [];

	params?.forEach((param /* , index */) => {
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
