/* eslint-disable vars-on-top */
/* eslint-disable no-var */
/* eslint-disable @typescript-eslint/no-unused-vars */
export {};

/// <reference types="@devist/shared/@types/parse" />
/// <reference types="@devist/shared/@types/utils" />

declare global {
	var LOCAL: boolean | undefined;
	var PRODUCTION: boolean | undefined;
	var FORCE_PROD: boolean | undefined;
	var FORCE_PREPROD: boolean | undefined;
}
