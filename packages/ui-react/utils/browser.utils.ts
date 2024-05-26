export interface InViewPortType {
	distanceFromEnd: number;
	callback: () => boolean;
	target: HTMLElement;
}

export const checkInViewIntersectionObserver = ({ target, distanceFromEnd, callback }: InViewPortType) => {
	const funCallback: IntersectionObserverCallback = (
		entries: IntersectionObserverEntry[],
		observer: IntersectionObserver,
	) => {
		entries.map((entry: IntersectionObserverEntry) => {
			if (entry.isIntersecting) {
				// NEED CALLBACK WILL RETURN BOOLEAN ---- IF TRUE WE WILL UN_OBSERVER AND FALSE IS NO
				const unobserve = callback();

				if (unobserve) {
					observer.unobserve(entry.target);
				}
			}

			return true;
		});
	};

	// _checkBrowserSupport-----
	if (typeof window.IntersectionObserver === 'undefined') {
		console.error('window.IntersectionObserver === undefined! => Your Browser is not supported');
		return;
	}

	const options = {
		root: null,
		rootMargin: `${distanceFromEnd}px 0px`,
		threshold: 0,
	};

	const observer = new IntersectionObserver(funCallback, options);

	if (target) {
		observer.observe(target);
	}
};
