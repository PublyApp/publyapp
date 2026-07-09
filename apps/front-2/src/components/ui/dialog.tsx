import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
	return <DialogPrimitive.Root {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
	return <DialogPrimitive.Portal {...props} />;
}

function DialogBackdrop({
	className,
	...props
}: DialogPrimitive.Backdrop.Props) {
	return <DialogPrimitive.Backdrop className={className} {...props} />;
}

function DialogPopup({ className, ...props }: DialogPrimitive.Popup.Props) {
	return <DialogPrimitive.Popup className={className} {...props} />;
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
	return <DialogPrimitive.Title className={className} {...props} />;
}

function DialogDescription({
	className,
	...props
}: DialogPrimitive.Description.Props) {
	return <DialogPrimitive.Description className={className} {...props} />;
}

export {
	Dialog,
	DialogPortal,
	DialogBackdrop,
	DialogPopup,
	DialogTitle,
	DialogDescription,
};
