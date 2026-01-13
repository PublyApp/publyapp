import { useMemo } from 'react';
import { useNavigate } from 'react-router';

// ----------------------------------------------------------------------

export const useRouter = () => {
	const navigate = useNavigate();

	const router = useMemo(() => {
		return {
			back: () => {
				return navigate(-1);
			},
			forward: () => {
				return navigate(1);
			},
			refresh: () => {
				return navigate(0);
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
