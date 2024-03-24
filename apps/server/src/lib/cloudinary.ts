import { v2 as cloudinary } from 'cloudinary';

import { env } from '@/server/lib/env';

// const { CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_NAME } = env;

export const initCloudinary = async () => {
	cloudinary.config({
		cloud_name: env.CLOUDINARY_NAME,
		api_key: env.CLOUDINARY_API_KEY,
		api_secret: env.CLOUDINARY_API_SECRET,
		secure: true,
	});
};

export default cloudinary;
