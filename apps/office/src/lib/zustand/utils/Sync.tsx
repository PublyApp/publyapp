import { useEffect } from 'react';

import usePathname from '@office/hooks/usePathame';

// const popstateEvent = new PopStateEvent('popstate', { state: null });
const pathnameChangeEvent = new Event('pathnameChange');

const SyncPathNameChange = () => {
	const pathname = usePathname();
	// const previous = usePrevious();

	useEffect(() => {
		// window.dispatchEvent(popstateEvent);
		console.log('pathname', pathname);
		window.dispatchEvent(pathnameChangeEvent);
	}, [pathname]);

	return null;
};

export default SyncPathNameChange;
