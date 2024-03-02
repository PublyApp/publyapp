import { useEffect, useState } from 'react';

import { sleep } from '@devist/shared/utils/any.utils';

const useFakeLoading = (timeout = 500) => {
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const fakeLoading = async () => {
			await sleep(timeout);
			setLoading(false);
		};

		fakeLoading();
	}, [timeout]);

	return loading;
};

export default useFakeLoading;
