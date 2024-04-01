import multer from 'multer';

export const multerConfig = multer({
	storage: multer.memoryStorage(),
});
