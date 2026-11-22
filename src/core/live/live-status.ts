import { useSyncExternalStore } from 'react';

export type LiveState = 'off' | 'connecting' | 'on';
let state: LiveState = 'off';
const listeners = new Set<() => void>();

export function setLiveState(next: LiveState): void {
  if (state === next) return;
  state = next;
  listeners.forEach((l) => l());
}
export function useLiveState(): LiveState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => 'off' as LiveState,
  );
}
