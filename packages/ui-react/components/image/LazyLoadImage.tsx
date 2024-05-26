/* eslint-disable @typescript-eslint/naming-convention */
import { useCallback, useEffect, useRef, useState, type FC, type ImgHTMLAttributes } from 'react';

import { css, cx } from '@emotion/css';
import { Box } from '@mui/material';

import { checkInViewIntersectionObserver } from '../../utils/browser.utils';
import { PlaceIcon } from '../CustomIcons';

export interface LazyLoadImageProps extends ImgHTMLAttributes<HTMLImageElement> {
	containerClassName?: string;
}

const styles = {
	ncClass: css({
		width: '100%',
		height: '100%',
		objectFit: 'cover',
	}),
};

const LazyLoadImage: FC<LazyLoadImageProps> = ({
	//
	containerClassName = '',
	alt = 'nc-imgs',
	src = '',
	...args
}) => {
	const isMounted = useRef(false);
	const _containerRef = useRef(null);
	const _imageEl = useRef<HTMLImageElement | null>(null);
	// const darkmodeState = useAppSelector(selectDarkmodeState);

	const [__src, set__src] = useState('');
	const [imageLoaded, setImageLoaded] = useState(false);

	const _handleImageLoaded = useCallback(() => {
		if (!isMounted) return;
		setImageLoaded(true);
		set__src(src);
	}, [src]);

	const _imageOnViewPort = useCallback(() => {
		if (!src) {
			_handleImageLoaded();
			return true;
		}

		_imageEl.current = new Image();

		if (_imageEl) {
			_imageEl.current.src = src;
			_imageEl.current.addEventListener('load', _handleImageLoaded);
		}

		return true;
	}, [_handleImageLoaded, src]);

	const _checkInViewPort = useCallback(() => {
		if (!_containerRef.current) return;
		checkInViewIntersectionObserver({
			target: _containerRef.current as never,
			distanceFromEnd: 0,
			callback: _imageOnViewPort,
		});
	}, [_imageOnViewPort]);

	const _initActions = useCallback(async () => {
		// set__src(placeholderImage);
		_checkInViewPort();
	}, [_checkInViewPort]);

	useEffect(() => {
		isMounted.current = true;
		_initActions();

		return () => {
			isMounted.current = false;
		};
	}, [_initActions, src]);

	const renderLoadingPlaceholder = () => {
		return (
			<Box
				className={cx('', styles.ncClass)}
				sx={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					backgroundColor: (theme) => {
						return theme.palette.grey[200];
					},
					color: (theme) => {
						return theme.palette.common.white;
					},
				}}
			>
				<Box
					sx={{
						height: '50%',
						width: '50%',
						maxWidth: '50%',
					}}
				>
					<PlaceIcon sx={{ width: '100%', height: '100%' }} />
				</Box>
			</Box>
		);
	};

	return (
		<div className={cx('nc-NcImage', containerClassName)} data-nc-id="NcImage" ref={_containerRef}>
			{__src && imageLoaded ? (
				<img src={__src} className={cx('', styles.ncClass, args.className)} alt={alt} {...args} />
			) : (
				renderLoadingPlaceholder()
			)}
		</div>
	);
};

export default LazyLoadImage;
