import { v2 as cloudinary } from 'cloudinary';

import { env } from '@/server/lib/env';

export const initCloudinary = async () => {
	cloudinary.config({
		cloud_name: env.CLOUDINARY_NAME,
		api_key: env.CLOUDINARY_API_KEY,
		api_secret: env.CLOUDINARY_API_SECRET,
		secure: true,
	});
	return cloudinary;
};

// export async function createImageUpload() {
// 	const timestamp = new Date().getTime()
// 	const signature = await cloudinary.utils.api_sign_request(
// 		{
// 			timestamp,
// 		},
// 		env.CLOUDINARY_API_SECRET
// 	)
// 	return { timestamp, signature }
// }

// export const { signature, timestamp } = await createImageUpload()

export default cloudinary;
