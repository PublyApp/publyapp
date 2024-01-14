import _ from 'lodash';

export const getLastPath = (path: string, n = 1) => {
	const last = _.takeRight(path.split('/'), n).join('/');
	// const splittedPath = path.split('/');
	// const last= splittedPath.slice()

	// console.log(path, last);
	return last;
};
