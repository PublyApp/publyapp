type ClassValue =
	| ClassArray
	| ClassDictionary
	| string
	| number
	| bigint
	| null
	| boolean
	| undefined;
type ClassDictionary = Record<string, boolean>;
type ClassArray = ClassValue[];

const toVal = (mix: unknown) => {
	let k;
	let y;
	let str = '';

	if (typeof mix === 'string' || typeof mix === 'number') {
		str += mix;
	} else if (typeof mix === 'object') {
		if (Array.isArray(mix)) {
			const len = mix.length;

			for (k = 0; k < len; k += 1) {
				if (mix[k]) {
					y = toVal(mix[k]);

					if (y) {
						if (str) str += ' ';
						str += y;
					}
				}
			}
		} else {
			for (y in mix) {
				if (
					mix &&
					typeof mix === 'object' &&
					!Array.isArray(mix) &&
					(mix as Record<string, unknown>)[y]
				) {
					if (str) str += ' ';
					str += y;
				}
			}
		}
	}

	return str;
};

/**
 * Class merging utility
 * Exactly the same as clsx: https://www.npmjs.com/package/clsx
 */
export const cn = (...args: ClassValue[]): string => {
	let i = 0;
	let tmp;
	let x;
	let str = '';
	const len = args.length;

	for (; i < len; i += 1) {
		tmp = args[i];

		if (tmp) {
			x = toVal(tmp);

			if (x) {
				if (str) {
					str += ' ';
				}

				str += x;
			}
		}
	}

	return str;
};
