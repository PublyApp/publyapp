import { Button } from '@/front/components/tremor/Button';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/front/components/tremor/Dialog';

const AddTenantModal = () => {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button>Add Tenant</Button>
			</DialogTrigger>

			<DialogContent
				className="sm:max-w-7xl"
				onPointerDownOutside={(e) => {
					e.preventDefault();
				}}
			>
				<DialogHeader>
					<DialogTitle>Account Created Successfully</DialogTitle>
					<DialogDescription className="mt-1 text-sm leading-6">
						Your account has been created successfully. You can now login to your account. For more information, please
						contact us.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter className="mt-6">
					<DialogClose asChild>
						<Button className="mt-2 w-full sm:mt-0 sm:w-fit" variant="secondary">
							Go back
						</Button>
					</DialogClose>
					<DialogClose asChild>
						<Button className="w-full sm:w-fit">Ok, got it!</Button>
					</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

export default AddTenantModal;
