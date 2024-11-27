/* eslint no-unused-vars: "off" */
/**
 * @interface
 * @memberof module:Adapters
 * Logger Adapter
 * Allows you to change the logger mechanism
 * Default is WinstonLoggerAdapter.js
 */
interface LoggerAdapter {
	/**
	 * log
	 * @param {string} level
	 * @param {string} message
	 * @param {...any[]} meta
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	log(level: string, message: string, ...meta: any[]): any;
}

export default LoggerAdapter;
