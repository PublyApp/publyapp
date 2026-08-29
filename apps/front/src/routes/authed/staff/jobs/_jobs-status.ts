import type { StatusPillTone } from '~/components/ui/status-tone';

type Translator = (key: string, options?: Record<string, unknown>) => string;

/** Wire status vocabulary is lowercase (see FindJobQueueItemsForStaff). */
const QUEUE_WIRE_STATUSES = [
	'pending',
	'processing',
	'completed',
	'failed',
] as const;

type QueueWireStatus = (typeof QUEUE_WIRE_STATUSES)[number];

const QUEUE_STATUS_LABEL_KEYS = {
	pending: 'queue-status-pending',
	processing: 'queue-status-processing',
	completed: 'queue-status-completed',
	failed: 'queue-status-failed',
} satisfies Record<QueueWireStatus, string>;

const isQueueWireStatus = (status: string): status is QueueWireStatus =>
	(QUEUE_WIRE_STATUSES as readonly string[]).includes(status);

export const queueStatusLabel = (
	t: Translator,
	status: string | null,
): string => {
	if (!status) {
		return '-';
	}

	if (!isQueueWireStatus(status)) {
		return status;
	}

	return t(QUEUE_STATUS_LABEL_KEYS[status]);
};

export const queueStatusTone = (status: string | null): StatusPillTone => {
	if (status === 'failed') {
		return 'danger';
	}

	if (status === 'processing') {
		return 'warning';
	}

	if (status === 'pending') {
		return 'info';
	}

	return 'neutral';
};

/** Mirrors `ExternalStateStatus` (None=0 … Unclassified=6). */
const EXTERNAL_STATE_VALUES = [0, 1, 2, 3, 4, 5, 6] as const;

type ExternalStateValue = (typeof EXTERNAL_STATE_VALUES)[number];

const EXTERNAL_STATE_LABEL_KEYS = {
	0: 'dl-state-none',
	1: 'dl-state-present',
	2: 'dl-state-expired',
	3: 'dl-state-never-prepared',
	4: 'dl-state-missing',
	5: 'dl-state-transferred',
	6: 'dl-state-unclassified',
} satisfies Record<ExternalStateValue, string>;

const isExternalStateValue = (value: number): value is ExternalStateValue =>
	(EXTERNAL_STATE_VALUES as readonly number[]).includes(value);

export const externalStateStatusLabel = (
	t: Translator,
	status: number | null | undefined,
): string => {
	if (status === null || status === undefined) {
		return '-';
	}

	if (!isExternalStateValue(status)) {
		return t('dl-state-unknown');
	}

	return t(EXTERNAL_STATE_LABEL_KEYS[status]);
};

export const externalStateStatusTone = (
	status: number | null | undefined,
): StatusPillTone => {
	if (status === 6) {
		return 'warning';
	}

	if (status === 1) {
		return 'info';
	}

	if (status === 2 || status === 4) {
		return 'success';
	}

	return 'neutral';
};
