import NProgress from 'nprogress';
import { useEffect } from 'react';
import { useNavigation } from 'react-router';

import './styles.css';

// ----------------------------------------------------------------------

export function ProgressBar() {
	const navigation = useNavigation();
	const isLoading = navigation.state === 'loading';

	useEffect(() => {
		if (!isLoading) {
			return;
		}

		NProgress.start();

		return () => {
			NProgress.done();
		};
	}, [isLoading]);

	if (!isLoading) {
		return null;
	}

	return null;
}
