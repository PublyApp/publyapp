// Type declaration for jsdom, which ships without its own types and is not
// resolvable under front's tsconfig types array.
declare module 'jsdom' {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export class JSDOM {
		constructor(html: string);
		readonly window: {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			document: any;
		};
	}
}
