/* eslint-disable no-var */
/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference types="@devist/shared/@types/parse" />
/// <reference types="@devist/shared/@types/utils" />

var LOCAL: boolean | undefined;
var PRODUCTION: boolean | undefined;
var FORCE_PROD: boolean | undefined;
var FORCE_PREPROD: boolean | undefined;

declare module 'parse-dashboard';

namespace NodeJS {
	interface A {
		a: number;
	}
	// eslint-disable-next-line @typescript-eslint/no-empty-interface
	interface ProcessEnv extends A {}
}
