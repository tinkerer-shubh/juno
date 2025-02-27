import type { MemorySize } from '$declarations/satellite/satellite.did';
import { icpXdrConversionRate } from '$lib/api/cmc.api';
import { canisterStatus } from '$lib/api/ic.api';
import { memorySize as memorySizeOrbiter } from '$lib/api/orbiter.worker.api';
import { memorySize as memorySizeSatellite } from '$lib/api/satellites.worker.api';
import {
	CYCLES_WARNING,
	MEMORY_HEAP_WARNING,
	SYNC_CYCLES_TIMER_INTERVAL
} from '$lib/constants/app.constants';
import { cyclesIdbStore } from '$lib/stores/idb.store';
import type { CanisterInfo, CanisterSegment, CanisterSyncData } from '$lib/types/canister';
import type { PostMessageDataRequest, PostMessageRequest } from '$lib/types/post-message';
import { cyclesToICP } from '$lib/utils/cycles.utils';
import {
	emitCanister,
	emitCanisters,
	emitSavedCanisters,
	loadIdentity
} from '$lib/utils/worker.utils';
import type { Identity } from '@dfinity/agent';
import { isNullish, nonNullish } from '@dfinity/utils';
import { set } from 'idb-keyval';

export const onCyclesMessage = async ({ data: dataMsg }: MessageEvent<PostMessageRequest>) => {
	const { msg, data } = dataMsg;

	switch (msg) {
		case 'stopCyclesTimer':
			stopCyclesTimer();
			return;
		case 'startCyclesTimer':
			await startCyclesTimer({ data });
			return;
		case 'restartCyclesTimer':
			stopCyclesTimer();
			await startCyclesTimer({ data });
			return;
	}
};

let timer: NodeJS.Timeout | undefined = undefined;

const startCyclesTimer = async ({ data: { segments } }: { data: PostMessageDataRequest }) => {
	const identity = await loadIdentity();

	if (isNullish(identity)) {
		// We do nothing if no identity
		return;
	}

	const sync = async () => await syncCanisters({ identity, segments: segments ?? [] });

	// We sync the cycles now but also schedule the update afterwards
	await sync();

	timer = setInterval(sync, SYNC_CYCLES_TIMER_INTERVAL);
};

const stopCyclesTimer = () => {
	if (!timer) {
		return;
	}

	clearInterval(timer);
	timer = undefined;
};

let syncing = false;

const syncCanisters = async ({
	identity,
	segments
}: {
	identity: Identity;
	segments: CanisterSegment[];
}) => {
	if (segments.length === 0) {
		// No canister to sync
		return;
	}

	// We avoid to relaunch a sync while previous sync is not finished
	if (syncing) {
		return;
	}

	syncing = true;

	await emitSavedCanisters({
		canisterIds: segments.map(({ canisterId }) => canisterId),
		customStore: cyclesIdbStore
	});

	try {
		const trillionRatio: bigint = await icpXdrConversionRate();

		await syncIcStatusCanisters({ identity, segments, trillionRatio });
	} finally {
		syncing = false;
	}
};

const syncIcStatusCanisters = async ({
	identity,
	segments,
	trillionRatio
}: {
	identity: Identity;
	segments: CanisterSegment[];
	trillionRatio: bigint;
}) => {
	const syncStatusAndMemoryPerCanister = async ({
		canisterId,
		segment
	}: CanisterSegment): Promise<CanisterSyncData> => {
		try {
			const [canisterResult, memorySizeResult] = await Promise.allSettled([
				canisterStatus({ canisterId, identity }),
				...(segment === 'satellite'
					? [memorySizeSatellite({ satelliteId: canisterId, identity })]
					: segment === 'orbiter'
						? [memorySizeOrbiter({ orbiterId: canisterId, identity })]
						: [])
			]);

			if (canisterResult.status === 'rejected') {
				throw canisterResult.reason;
			}

			const { value: canisterInfo } = canisterResult;

			// We silence those error because we managed the canister status.
			// Satellites and orbiters which were not migrated for example will throw an error because the end point won't be exposed.
			if (memorySizeResult?.status === 'rejected') {
				console.error(`Error fetching memory size information: `, memorySizeResult.reason);
			}

			const canister = mapCanisterSyncData({
				canisterInfo,
				trillionRatio,
				canisterId: canisterInfo.canisterId,
				memory: memorySizeResult?.status === 'fulfilled' ? memorySizeResult.value : undefined
			});

			// We emit the canister data this way the UI can render asynchronously render the information without waiting for all canisters status to be fetched.
			emitCanister(canister);

			return canister;
		} catch (err: unknown) {
			console.error(err);

			return {
				id: canisterId,
				sync: 'error'
			};
		}
	};

	const canisters = await Promise.all(segments.map(syncStatusAndMemoryPerCanister));

	// Save information in indexed-db as well to load previous values on navigation and refresh
	for (const { id, ...rest } of canisters.filter(({ sync }) => sync !== 'error')) {
		await set(id, { id, ...rest }, cyclesIdbStore);
	}

	// We also emits all canisters status for syncing the potential errors but also to hold the value in the UI in a stores that gets updated in bulk and lead to less re-render
	emitCanisters(canisters);
};

const mapCanisterSyncData = ({
	canisterId,
	trillionRatio,
	canisterInfo: { canisterId: _, cycles, ...rest },
	memory
}: {
	canisterId: string;
	trillionRatio: bigint;
	canisterInfo: CanisterInfo;
	memory: MemorySize | undefined;
}): CanisterSyncData => ({
	id: canisterId,
	sync: 'synced',
	data: {
		icp: cyclesToICP({ cycles, trillionRatio }),
		warning: {
			cycles: cycles < CYCLES_WARNING,
			heap: (memory?.heap ?? 0n) >= MEMORY_HEAP_WARNING
		},
		canister: {
			cycles,
			...rest
		},
		...(nonNullish(memory) && { memory })
	}
});
