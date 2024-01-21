import { useMemo } from 'react';

import { useNavigate } from '@remix-run/react';

// ----------------------------------------------------------------------

const useRouter = () => {
	const navigate = useNavigate();

	const router = useMemo(() => {
		return {
			back: () => {
				return navigate(-1);
			},
			forward: () => {
				return navigate(1);
			},
			reload: () => {
				return window.location.reload();
			},
			push: (href: string) => {
				return navigate(href);
			},
			replace: (href: string) => {
				return navigate(href, { replace: true });
			},
		};
	}, [navigate]);

	return router;
};

export default useRouter;
