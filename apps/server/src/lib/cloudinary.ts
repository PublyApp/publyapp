import cloudinary from 'cloudinary';

import { env } from '@/server/lib/env';

const { CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_NAME } = env;

export const initCloudinary = async () => {
	cloudinary.v2.config({
		cloud_name: CLOUDINARY_NAME,
		api_key: CLOUDINARY_API_KEY,
		api_secret: CLOUDINARY_API_SECRET,
		secure: true,
	});
};
