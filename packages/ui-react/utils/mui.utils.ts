import type { SxProps, Theme } from '@mui/material';
import type { SystemStyleObject } from '@mui/system';
import _ from 'lodash';

export const mergeSxProps = (...sxProps: (SxProps<Theme> | undefined)[]) => {
	const sxArray: (boolean | SystemStyleObject<Theme> | ((theme: Theme) => SystemStyleObject<Theme>))[] = [];

	sxProps.forEach((sx) => {
		if (_.isNil(sx)) {
			// do nothing
		} else if (_.isArray(sx)) {
			sxArray.push(...sx);
		} else {
			sxArray.push(sx as never);
		}
	});

	return sxArray;
};
