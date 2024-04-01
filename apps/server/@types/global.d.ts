/* eslint-disable vars-on-top */
/* eslint-disable no-var */
/* eslint-disable @typescript-eslint/no-unused-vars */
export {};

declare global {
	var LOCAL: boolean | undefined;
	var MODE: 'local' | 'development' | 'production' | 'test' | string | undefined;
	// var PRODUCTION: boolean | undefined;
	// var FORCE_PROD: boolean | undefined;
	// var FORCE_PREPROD: boolean | undefined;
}
