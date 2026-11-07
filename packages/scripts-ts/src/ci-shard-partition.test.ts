import { describe, expect, it } from 'vitest';

import { PARTITION_SHARD, isPartitionShard } from './ci-shard-partition.ts';

describe('ci-shard-partition', () => {
	it('runs the partition proof on shard 1 only', () => {
		expect(PARTITION_SHARD).toBe('1');
		expect(isPartitionShard('1')).toBe(true);
		expect(isPartitionShard('2')).toBe(false);
		expect(isPartitionShard('4')).toBe(false);
	});

	it('skips when the shard is unknown rather than proving nothing twice', () => {
		expect(isPartitionShard(undefined)).toBe(false);
		expect(isPartitionShard('')).toBe(false);
	});
});
