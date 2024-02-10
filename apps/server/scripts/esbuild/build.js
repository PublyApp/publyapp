/* eslint-disable prefer-arrow/prefer-arrow-functions */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable func-style */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable import/order */
const esbuild = require('esbuild');

const { buildOptions } = require('./config');

const toDeploy = ['production', 'preprod'].includes(process.env.MODE);
buildOptions.minify = toDeploy;

async function build() {
	esbuild.build(buildOptions);
}

build();
