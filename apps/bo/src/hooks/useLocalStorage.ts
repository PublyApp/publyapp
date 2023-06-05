import React from 'react';

function useLocalStorage<T>(storageKey: string, fallbackState: T): [T, React.Dispatch<React.SetStateAction<T>>] {
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const [value, setValue] = React.useState<T>(JSON.parse(localStorage.getItem(storageKey)!) ?? fallbackState);

	React.useEffect(() => {
		localStorage.setItem(storageKey, JSON.stringify(value));
	}, [value, storageKey]);

	return [value, setValue];
}

export default useLocalStorage;
