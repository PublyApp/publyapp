// import './functions';
// import './triggers';
// import Parse from 'parse/node.js';

export const cloud = async () => {
	await Promise.all([import('./functions'), import('./triggers')]);
};
