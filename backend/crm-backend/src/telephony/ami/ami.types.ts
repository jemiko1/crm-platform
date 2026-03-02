export interface RawAmiEvent {
  event: string;
  privilege?: string;
  uniqueid?: string;
  linkedid?: string;
  channel?: string;
  channelstate?: string;
  channelstatedesc?: string;
  calleridnum?: string;
  calleridname?: string;
  connectedlinenum?: string;
  connectedlinename?: string;
  language?: string;
  accountcode?: string;
  context?: string;
  exten?: string;
  priority?: string;
  destuniqueid?: string;
  destchannel?: string;
  destcalleridnum?: string;
  destcalleridname?: string;
  destconnectedlinenum?: string;
  destcontext?: string;
  destexten?: string;
  dialstatus?: string;
  queue?: string;
  count?: string;
  position?: string;
  holdtime?: string;
  talktime?: string;
  ringtime?: string;
  member?: string;
  membername?: string;
  interface?: string;
  cause?: string;
  'cause-txt'?: string;
  bridgeuniqueid?: string;
  bridgetype?: string;
  transfereechannel?: string;
  transfererchannel?: string;
  transfertargetchannel?: string;
  isexternal?: string;
  result?: string;
  origtransfererchannel?: string;
  state?: string;
  paused?: string;
  pausedreason?: string;
  [key: string]: string | undefined;
}

export interface AmiConnectionConfig {
  host: string;
  port: number;
  user: string;
  secret: string;
  enabled: boolean;
  reconnectInterval: number;
}

export interface AmiManagerInstance {
  connect: () => void;
  disconnect: () => void;
  keepConnected: () => void;
  on: (event: string, callback: (evt: RawAmiEvent) => void) => void;
  action: (
    action: Record<string, string>,
    callback?: (err: Error | null, res: any) => void,
  ) => void;
  connected: boolean;
}

export function extractExtensionFromChannel(channel?: string): string | null {
  if (!channel) return null;
  const match = channel.match(/^(?:SIP|PJSIP|IAX2)\/(\d+)/i);
  return match ? match[1] : null;
}
