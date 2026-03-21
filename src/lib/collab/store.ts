import { writable } from 'svelte/store';
import type { CollabPeer, CollabRoomInfo } from './types';

export const collabActive = writable(false);
export const collabRoom = writable<CollabRoomInfo | null>(null);
export const collabPeers = writable<CollabPeer[]>([]);
export const collabConnected = writable(false);
export const collabPanelOpen = writable(false);

const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('texbrain-collab-name') : null;
export const collabUserName = writable(stored || '');

if (typeof localStorage !== 'undefined') {
  collabUserName.subscribe((name) => {
    localStorage.setItem('texbrain-collab-name', name);
  });
}
