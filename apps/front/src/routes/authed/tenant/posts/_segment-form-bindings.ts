import type { UseFormReturn } from 'react-hook-form';

import { segmentsShifted } from './_segment-draft';
import type { SegmentDraft } from './_segment-draft';
import type {
	EditSegmentImagesState,
	PostFormValues,
} from './_use-edit-segment-images';

/** What the segments editor needs from the post form: each follow-up's field
 * error, and a change handler that never carries a position-keyed error to
 * another block after a remove or reorder. */
export const segmentFormBindings = (
	methods: UseFormReturn<PostFormValues>,
	segments: readonly SegmentDraft[],
	unsaved?: Pick<EditSegmentImagesState, 'dismissFormNotice'>,
) => ({
	errors: segments.map(
		(_, index) => methods.formState.errors.segments?.[index]?.text?.message,
	),
	onChange: (next: SegmentDraft[]) => {
		if (segmentsShifted(segments, next)) {
			methods.clearErrors('segments');
			unsaved?.dismissFormNotice();
		}
		methods.setValue('segments', next, { shouldDirty: true });
	},
});
