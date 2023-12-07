import { useEffect, useState } from 'react';

const useFakeLoading = (timeout = 500) => {
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const fakeLoading = async () => {
			await new Promise((resolve) => {
				// eslint-disable-next-line no-promise-executor-return
				return setTimeout(resolve, timeout);
			});
			setLoading(false);
		};

		fakeLoading();
	}, [timeout]);

	return loading;
};

export default useFakeLoading;
