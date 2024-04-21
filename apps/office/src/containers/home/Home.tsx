import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import useTranslate from '@devist/ui-react/hooks/useTranslate';

import RouterLink from '@/office/components/RouterLink';
import { useLogOutMutation } from '@/ui-react/lib/react-query/features/auth/auth.hooks';

// import { initParse } from '@/office/lib/parse/legacy';
// initParse();

const Home = () => {
	const { t } = useTranslation();
	const { lang, setLocale } = useTranslate();

	const {
		result: { mutate: logOut },
	} = useLogOutMutation({
		onSuccess: () => {
			// navigate(BO_PATH_NAMES.auth.login);
			// revalidate();
		},
	});

	// console.log('ggggg');
	return (
		<>
			<Typography variant="h1">Home / {t('hello')}</Typography>

			<br />
			<Button
				onClick={() => {
					setLocale(lang.value === 'en' ? 'fr' : 'en');
				}}
				variant="contained"
				color="warning"
			>
				Change locale
			</Button>

			<br />
			<Button
				variant="contained"
				onClick={() => {
					logOut();
				}}
			>
				log out
			</Button>

			<br />
			<RouterLink href="/unexistant-path">test link to 404 not found</RouterLink>
			<br />
			<RouterLink href="/dashboard/posts/edit/fsdfsfsfdsdfsdfs">test not found resource</RouterLink>
		</>
	);
};

export default Home;
