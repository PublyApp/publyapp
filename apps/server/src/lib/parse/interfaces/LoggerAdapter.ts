/* eslint no-unused-vars: "off" */
/**
 * @interface
 * @memberof module:Adapters
 * Logger Adapter
 * Allows you to change the logger mechanism
 * Default is WinstonLoggerAdapter.js
 */
export interface LoggerAdapter {
	/**
	 * log
	 * @param {string} level
	 * @param {string} message
	 * @param {...any[]} meta
	 */

	// biome-ignore lint/suspicious/noExplicitAny: safe to use any here
	log(level: string, message: string, ...meta: any[]): any;
}
