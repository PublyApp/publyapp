/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-param-reassign */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable prefer-arrow/prefer-arrow-functions */
/* eslint-disable func-style */

// @ts-check

const { createRsbuild, build } = require('./config');

const toDeploy = ['preprod', 'production'].includes(process.env.MODE || '');

if (toDeploy) {
	process.env.NODE_ENV = 'production';
} else {
	process.env.NODE_ENV = 'development';
}

const run = async () => {
	const rsbuild = await createRsbuild();

	build(rsbuild);
};

run();
