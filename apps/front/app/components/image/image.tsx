import { startTransition, useCallback, useRef, useState } from 'react';

import type { Breakpoint } from '@mui/material/styles';
import { useInView, type UseInViewOptions } from 'framer-motion';
import { mergeClasses, mergeRefs } from 'minimal-shared/utils';

import { imageClasses } from './classes';
import {
	ImageImg,
	ImageOverlay,
	ImagePlaceholder,
	ImageRoot,
	type EffectsType,
} from './styles';

// ----------------------------------------------------------------------

type AspectRatioType =
	| '2/3'
	| '3/2'
	| '4/3'
	| '3/4'
	| '6/4'
	| '4/6'
	| '16/9'
	| '9/16'
	| '21/9'
	| '9/21'
	| '1/1'
	| string;

export type ImageProps = React.ComponentProps<typeof ImageRoot> & {
	src?: string;
	alt?: string;
	delayTime?: number;
	onLoad?: () => void;
	effect?: EffectsType;
	visibleByDefault?: boolean;
	disablePlaceholder?: boolean;
	viewportOptions?: UseInViewOptions;
	ratio?: AspectRatioType | Partial<Record<Breakpoint, AspectRatioType>>;
	slotProps?: {
		img?: Omit<React.ComponentProps<typeof ImageImg>, 'src' | 'alt'>;
		overlay?: React.ComponentProps<typeof ImageOverlay>;
		placeholder?: React.ComponentProps<typeof ImagePlaceholder>;
	};
};

const DEFAULT_DELAY = 0;
const DEFAULT_EFFECT: EffectsType = {
	style: 'blur',
	duration: 300,
	disabled: false,
};

export const Image = ({
	sx,
	src,
	ref,
	ratio,
	onLoad,
	effect,
	alt = '',
	slotProps,
	className,
	viewportOptions,
	disablePlaceholder,
	visibleByDefault = false,
	delayTime = DEFAULT_DELAY,
	...other
}: ImageProps) => {
	const localRef = useRef<HTMLSpanElement>(null);
	const [isLoaded, setIsLoaded] = useState(false);

	const isInView = useInView(localRef, {
		once: true,
		...viewportOptions,
	});

	const handleImageLoad = useCallback(() => {
		const timer = setTimeout(() => {
			startTransition(() => {
				setIsLoaded(true);
				onLoad?.();
			});
		}, delayTime);

		return () => {
			return clearTimeout(timer);
		};
	}, [delayTime, onLoad]);

	const finalEffect = {
		...DEFAULT_EFFECT,
		...effect,
	};

	const shouldRenderImage = visibleByDefault || isInView;
	const showPlaceholder = !visibleByDefault && !isLoaded && !disablePlaceholder;

	const renderComponents = {
		// eslint-disable-next-line react/no-unstable-nested-components
		overlay: () => {
			return (
				slotProps?.overlay && (
					<ImageOverlay
						className={imageClasses.overlay}
						{...slotProps.overlay}
					/>
				)
			);
		},
		// eslint-disable-next-line react/no-unstable-nested-components
		placeholder: () => {
			return (
				showPlaceholder && (
					<ImagePlaceholder
						className={imageClasses.placeholder}
						{...slotProps?.placeholder}
					/>
				)
			);
		},
		// eslint-disable-next-line react/no-unstable-nested-components
		image: () => {
			return (
				<ImageImg
					src={src}
					alt={alt}
					onLoad={handleImageLoad}
					className={imageClasses.img}
					{...slotProps?.img}
				/>
			);
		},
	};

	return (
		<ImageRoot
			ref={mergeRefs([localRef, ref])}
			effect={
				visibleByDefault || finalEffect.disabled ? undefined : finalEffect
			}
			className={mergeClasses([imageClasses.root, className], {
				[imageClasses.state.loaded]: !visibleByDefault && isLoaded,
			})}
			sx={[
				{
					'--aspect-ratio': ratio,
					...(!!ratio && { width: 1 }),
				},
				...(Array.isArray(sx) ? sx : [sx]),
			]}
			{...other}
		>
			{renderComponents.overlay()}
			{renderComponents.placeholder()}
			{shouldRenderImage && renderComponents.image()}
		</ImageRoot>
	);
};
