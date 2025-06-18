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
	let k: string | number;
	let y: string | number;
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
