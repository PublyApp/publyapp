import './styles.css';

import NProgress from 'nprogress';
import { useEffect } from 'react';
import { useNavigation } from 'react-router';

// ----------------------------------------------------------------------

export function ProgressBar() {
	const navigation = useNavigation();
	const isLoading = navigation.state === 'loading';

	useEffect(() => {
		if (isLoading) {
			NProgress.start();
		} else {
			NProgress.done();
		}
	}, [isLoading]);

	if (!isLoading) {
		return null;
	}

	return null;
}
