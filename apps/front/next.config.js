/** @type {import('next').NextConfig} */
module.exports = {
	reactStrictMode: true,
	transpilePackages: ['@devist/ui-react'],
	trailingSlash: true,
	// modularizeImports: {
	// 	'@mui/material': {
	// 		transform: '@mui/material/{{member}}',
	// 	},
	// 	'@mui/lab': {
	// 		transform: '@mui/lab/{{member}}',
	// 	},
	// },
	webpack: (config) => {
		config.module.rules.push({
			test: /\.svg$/,
			use: ['@svgr/webpack'],
		});
		return config;
	},
};
