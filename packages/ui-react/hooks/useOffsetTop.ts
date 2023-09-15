import { useEffect, useState } from 'react';

import { useScroll } from 'framer-motion';

// ----------------------------------------------------------------------

type ReturnType = boolean;

interface UseScrollOptions extends Omit<ScrollOptions, 'container' | 'target'> {
	container?: React.RefObject<HTMLElement>;
	target?: React.RefObject<HTMLElement>;
}

const useOffSetTop = (top = 0, options?: UseScrollOptions): ReturnType => {
	const { scrollY } = useScroll(options);

	const [value, setValue] = useState(false);

	useEffect(() => {
		return scrollY.on('change', (scrollHeight) => {
			if (scrollHeight > top) {
				setValue(true);
			} else {
				setValue(false);
			}
		});
	}, [scrollY, top]);

	return value;
};

export default useOffSetTop;

// Usage
// const offset = useOffSetTop(100);

// Or
// const offset = useOffSetTop(100, {
//   container: ref,
// });
