// @ts-check

/**
 * dfs configuration
 *
 * This file configures your Dokploy deployments.
 * Docs: https://github.com/radandevist/dokploy-from-source
 */

module.exports = {
	server: 'https://myhpanel.iamradan.com',
	apps: {
		api: {
			appId: '9nsB_aZYrOLabu7xaQ4PE',
			build: {
				buildType: 'dockerfile',
				dockerfile: 'Dockerfile',
				dockerContextPath: '.',
			},
		},
		front: {
			appId: 'H0URvk5EIFIEBOtu65RyO',
			build: {
				buildType: 'dockerfile',
				dockerfile: 'Dockerfile',
				dockerContextPath: '.',
			},
		},
	},
};
