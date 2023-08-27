import _cors from 'cors';

// import { clientUrl } from '../config/app';
// import { Environment, environment } from '../config/environment';

type CorsOptions = { whiteList: string[] };

/**
 * Pre configured cors setup.
 * In function of the current running environment.
 * In test environment we have to allow the tester to request the api.
 * In development and production only the defined clientUrl will be allowed.
 */
export const cors = ({ whiteList }: CorsOptions) => {
	return _cors({
		origin(origin, callback) {
			if (!origin || whiteList.indexOf(origin) !== -1) {
				callback(null, true);
			} else {
				callback(new Error('Not allowed by CORS'));
			}
		},
	});
};
