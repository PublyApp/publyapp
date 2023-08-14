import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider } from 'react-router-dom';

import { FRONT_PATH_NAMES } from '@aktiveo/shared/utils/constants';

import LayoutBO from './components/layout/LayoutBO';
import Home from './containers/home/Home';
import NotFound from './containers/notFound/NotFound';
import Account from './containers/account/Account';
import RequireAuth from './components/RequireAuth';
import LogIn from './containers/logIn/LogIn';
import TypoPage from './containers/designSystem/TypoPage';
import ButtonsPage from './containers/designSystem/ButtonsPage';
import AITools from './containers/aiTools/AITools';

const router = createBrowserRouter(
	createRoutesFromElements(
		<Route path="/">
			<Route element={<RequireAuth />}>
				<Route element={<LayoutBO />}>
					<Route index element={<Home />} />
					<Route path="account" element={<Account />} />

					{/* ------- Showcasing the design system here */}
					<Route path="typography" element={<TypoPage />} />
					<Route path="buttons" element={<ButtonsPage />} />

					{/* ------- AI Tools ------------------------ */}
					<Route path={FRONT_PATH_NAMES.aiTools} element={<AITools />} />

					{/* // ---- not found page ------------------------------------------------------------------- */}
					<Route path="*" element={<NotFound />} />
				</Route>
			</Route>

			<Route path="/login" element={<LogIn />} />
		</Route>,
	),
);

const AppRoutes = () => {
	return <RouterProvider router={router} />;
};

export default AppRoutes;
