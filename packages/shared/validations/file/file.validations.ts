import { z } from 'zod';

export const folderNameSchema = z
	.string()
	.min(1)
	.refine((data) => {
		return data.indexOf('/') === -1;
	}, "folder name must no contain slashes ('/')");
