export interface CollabUser {
  name: string;
  color: string;
  colorLight: string;
}

export interface CollabPeer {
  clientId: number;
  user: CollabUser;
  currentFile: string | null;
}

export interface CollabRoomInfo {
  id: string;
  secret: string;
  shareCode: string;
  password: string | null;
  isHost: boolean;
}
