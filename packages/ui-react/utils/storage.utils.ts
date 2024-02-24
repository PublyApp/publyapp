// ----------------------------------------------------------------------

export const localStorageAvailable = () => {
	return typeof window !== 'undefined' && window.localStorage;
	// try {
	// 	const key = '__some_random_key_you_are_not_going_to_use__';
	// 	window.localStorage.setItem(key, key);
	// 	window.localStorage.removeItem(key);
	// 	return true;
	// } catch (error) {
	// 	return false;
	// }
};

export const localStorageGetItem = (key: string, defaultValue = '') => {
	const storageAvailable = localStorageAvailable();

	let value;

	if (storageAvailable) {
		value = localStorage.getItem(key) || defaultValue;
	}

	return value;
};

export const localStorageSetItem = (key: string, value: string) => {
	const storageAvailable = localStorageAvailable();

	if (storageAvailable) {
		localStorage.setItem(key, value);
	}
};
