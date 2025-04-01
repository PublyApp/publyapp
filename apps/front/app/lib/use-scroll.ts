import { useCallback, useEffect, useState } from 'react';

const useScroll = (threshold: number) => {
	const [scrolled, setScrolled] = useState(false);

	const onScroll = useCallback(() => {
		setScrolled(window.scrollY > threshold);
	}, [threshold]);

	useEffect(() => {
		window.addEventListener('scroll', onScroll);
		onScroll();

		return () => {
			return window.removeEventListener('scroll', onScroll);
		};
	}, [onScroll]);

	return scrolled;
};

export default useScroll;
