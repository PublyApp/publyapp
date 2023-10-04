import { useCallback, useState } from 'react';

// ----------------------------------------------------------------------

interface ReturnType {
	value: boolean;
	setTrue: () => void;
	setFalse: () => void;
	toggle: () => void;
	setValue: React.Dispatch<React.SetStateAction<boolean>>;
}

const useBoolean = (defaultValue?: boolean): ReturnType => {
	const [value, setValue] = useState(!!defaultValue);

	const setTrue = useCallback(() => {
		setValue(true);
	}, []);

	const setFalse = useCallback(() => {
		setValue(false);
	}, []);

	const toggle = useCallback(() => {
		setValue((prev) => {
			return !prev;
		});
	}, []);

	return {
		value,
		setTrue,
		setFalse,
		toggle,
		setValue,
	};
};

export default useBoolean;
