// @link https://stackoverflow.com/a/70123495/15003148
// eslint-disable-next-line @typescript-eslint/ban-types
export const isCallback = (maybeFunction: unknown): maybeFunction is Function => {
	return typeof maybeFunction === 'function';
};
