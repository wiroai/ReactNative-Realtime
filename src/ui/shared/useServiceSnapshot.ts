import { useSyncExternalStore } from 'react';

export interface SnapshotSource<TSnapshot> {
  readonly snapshot: TSnapshot;
  subscribe(listener: (snapshot: TSnapshot) => void): () => void;
}

/**
 * Adapts a service's `subscribe`/`snapshot` contract to React.
 *
 * Services publish immutable snapshots and never import React —
 * this is the one seam where a screen turns that into render state.
 */
export function useServiceSnapshot<TSnapshot>(
  service: SnapshotSource<TSnapshot>,
): TSnapshot {
  return useSyncExternalStore(
    listener => service.subscribe(listener),
    () => service.snapshot,
  );
}
