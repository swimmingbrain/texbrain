import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { get } from 'svelte/store';
import { collabActive, collabRoom, collabPeers, collabConnected, collabUserName } from './store';
import type { CollabUser, CollabPeer } from './types';

const COLORS = [
  { color: '#ff6b6b', colorLight: '#ff6b6b33' },
  { color: '#4ecdc4', colorLight: '#4ecdc433' },
  { color: '#ffa62b', colorLight: '#ffa62b33' },
  { color: '#a855f7', colorLight: '#a855f733' },
  { color: '#22c55e', colorLight: '#22c55e33' },
  { color: '#3b82f6', colorLight: '#3b82f633' },
  { color: '#f472b6', colorLight: '#f472b633' },
  { color: '#eab308', colorLight: '#eab30833' },
];

const SIGNALING = ['wss://signaling.yjs.dev'];
const SHARE_CODE_SEP = '#';

let ydoc: Y.Doc | null = null;
let provider: WebrtcProvider | null = null;
const userColor = COLORS[Math.floor(Math.random() * COLORS.length)];
const undoManagers = new Map<string, Y.UndoManager>();

function getUserName(): string {
  let name = get(collabUserName);
  if (!name) {
    name = 'User-' + Math.random().toString(36).slice(2, 6);
    collabUserName.set(name);
  }
  return name;
}

function generateSecret(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// if a password is set, mix it with the secret so both are required
function deriveEncryptionKey(secret: string, password: string | null): string {
  return password ? secret + ':' + password : secret;
}

function buildShareCode(roomId: string, secret: string): string {
  return roomId + SHARE_CODE_SEP + secret;
}

export function parseShareCode(code: string): { roomId: string; secret: string } | null {
  const idx = code.indexOf(SHARE_CODE_SEP);
  if (idx === -1) return null;
  const roomId = code.slice(0, idx);
  const secret = code.slice(idx + 1);
  if (!roomId || !secret) return null;
  return { roomId, secret };
}

export function getAwareness() {
  return provider?.awareness ?? null;
}

export function getYText(filePath: string): Y.Text | null {
  if (!ydoc) return null;
  return ydoc.getText('file:' + filePath);
}

export function getYTextWithUndo(filePath: string): { ytext: Y.Text; undoManager: Y.UndoManager } | null {
  if (!ydoc) return null;
  const ytext = ydoc.getText('file:' + filePath);
  let um = undoManagers.get(filePath);
  if (!um) {
    um = new Y.UndoManager(ytext);
    undoManagers.set(filePath, um);
  }
  return { ytext, undoManager: um };
}

// returns the share code (roomId#secret) that collaborators need to join
export function createRoom(
  password: string | null,
  projectFiles: Map<string, string>,
  entryPointPath: string | null
): string {
  const roomId = crypto.randomUUID();
  const secret = generateSecret();
  const encryptionKey = deriveEncryptionKey(secret, password);
  const shareCode = buildShareCode(roomId, secret);

  const doc = new Y.Doc();
  ydoc = doc;

  const fileMap = doc.getMap('project-files');
  const meta = doc.getMap('project-meta');

  doc.transact(() => {
    const fileList: string[] = [];
    for (const [path, content] of projectFiles) {
      const ytext = doc.getText('file:' + path);
      ytext.insert(0, content);
      fileList.push(path);
    }
    fileMap.set('fileList', fileList);
    if (entryPointPath) {
      meta.set('entryPoint', entryPointPath);
    }
  });

  provider = new WebrtcProvider(roomId, doc, {
    signaling: SIGNALING,
    maxConns: 20,
    password: encryptionKey
  });

  provider.awareness.setLocalStateField('user', {
    name: getUserName(),
    ...userColor
  });

  setupAwarenessListeners();

  collabActive.set(true);
  collabConnected.set(true);
  collabRoom.set({ id: roomId, secret, shareCode, password, isHost: true });

  return shareCode;
}

export function joinRoom(shareCode: string, password: string | null): Promise<void> {
  const parsed = parseShareCode(shareCode);
  if (!parsed) {
    return Promise.reject(new Error('Invalid share code. Expected format: roomId#secret'));
  }

  const { roomId, secret } = parsed;
  const encryptionKey = deriveEncryptionKey(secret, password);

  return new Promise((resolve) => {
    const doc = new Y.Doc();
    ydoc = doc;

    provider = new WebrtcProvider(roomId, doc, {
      signaling: SIGNALING,
      maxConns: 20,
      password: encryptionKey
    });

    provider.awareness.setLocalStateField('user', {
      name: getUserName(),
      ...userColor
    });

    setupAwarenessListeners();

    collabActive.set(true);
    collabRoom.set({ id: roomId, secret, shareCode, password, isHost: false });

    // wait for initial sync with at least one peer
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      collabConnected.set(true);
      resolve();
    };

    provider.on('synced', (e: { synced: boolean }) => {
      if (e.synced) done();
    });

    // timeout fallback if no peers are online yet
    setTimeout(done, 5000);
  });
}

function setupAwarenessListeners() {
  if (!provider) return;

  const awareness = provider.awareness;
  const updatePeers = () => {
    const peers: CollabPeer[] = [];
    awareness.getStates().forEach((state: any, clientId: number) => {
      if (clientId === awareness.clientID) return;
      if (state.user) {
        peers.push({
          clientId,
          user: state.user as CollabUser,
          currentFile: state.currentFile ?? null
        });
      }
    });
    collabPeers.set(peers);
  };

  awareness.on('change', updatePeers);
  updatePeers();
}

export function setCurrentFile(filePath: string | null) {
  if (!provider) return;
  provider.awareness.setLocalStateField('currentFile', filePath);
}

export function updateUserName(name: string) {
  collabUserName.set(name);
  if (!provider) return;
  provider.awareness.setLocalStateField('user', {
    name,
    ...userColor
  });
}

export function getSharedFileList(): string[] {
  if (!ydoc) return [];
  const fileMap = ydoc.getMap('project-files');
  return (fileMap.get('fileList') as string[]) || [];
}

export function getSharedEntryPoint(): string | null {
  if (!ydoc) return null;
  const meta = ydoc.getMap('project-meta');
  return (meta.get('entryPoint') as string) || null;
}

export function collectFilesFromYjs(): Map<string, string> {
  const result = new Map<string, string>();
  if (!ydoc) return result;
  for (const path of getSharedFileList()) {
    const ytext = ydoc.getText('file:' + path);
    result.set(path, ytext.toString());
  }
  return result;
}

export function isHost(): boolean {
  const room = get(collabRoom);
  return room?.isHost ?? false;
}

function getCompileMap(): Y.Map<any> | null {
  if (!ydoc) return null;
  return ydoc.getMap('compile');
}

export function requestCompile() {
  const map = getCompileMap();
  if (!map) return;
  map.set('requestedAt', Date.now());
}

export function setCompileStatus(status: string) {
  const map = getCompileMap();
  if (!map) return;
  map.set('status', status);
}

export function setCompileResult(result: {
  status: 'success' | 'error';
  pdf: Uint8Array | null;
  log: string[];
  errors: Array<{ type: string; message: string; line?: number; file?: string }>;
  pageCount: number;
}) {
  if (!ydoc) return;
  const map = ydoc.getMap('compile');
  ydoc.transact(() => {
    map.set('status', result.status);
    if (result.pdf) {
      map.set('pdf', result.pdf);
    }
    map.set('log', JSON.stringify(result.log));
    map.set('errors', JSON.stringify(result.errors));
    map.set('pageCount', result.pageCount);
    map.set('compiledAt', Date.now());
  });
}

export function readCompileState(): {
  status: string;
  pdf: Uint8Array | null;
  log: string;
  errors: string;
  pageCount: number;
} {
  const defaults = { status: 'idle', pdf: null, log: '[]', errors: '[]', pageCount: 1 };
  if (!ydoc) return defaults;
  const map = ydoc.getMap('compile');
  return {
    status: (map.get('status') as string) || 'idle',
    pdf: (map.get('pdf') as Uint8Array) || null,
    log: (map.get('log') as string) || '[]',
    errors: (map.get('errors') as string) || '[]',
    pageCount: (map.get('pageCount') as number) || 1,
  };
}

// returns an unsubscribe function
export function observeCompileState(callback: (key: string, value: any) => void): () => void {
  if (!ydoc) return () => {};
  const map = ydoc.getMap('compile');
  const handler = (event: any) => {
    event.changes.keys.forEach((_change: any, key: string) => {
      callback(key, map.get(key));
    });
  };
  map.observe(handler);
  return () => map.unobserve(handler);
}

export function leaveRoom() {
  if (provider) {
    provider.disconnect();
    provider.destroy();
    provider = null;
  }
  if (ydoc) {
    ydoc.destroy();
    ydoc = null;
  }

  undoManagers.clear();

  collabActive.set(false);
  collabConnected.set(false);
  collabRoom.set(null);
  collabPeers.set([]);
}
