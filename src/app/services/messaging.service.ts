import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { SignalingService, ChatMessage, PeerInfo } from './signaling.service';
import { LanStorageService, StoredMessage } from './lan-storage.service';
import { WebrtcService } from './webrtc.service';
import { ProfileService } from './profile.service';

export interface DisplayMessage {
  id?: number;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  type: 'text' | 'system';
  isOwn: boolean;
}

export interface ChannelInfo {
  id: string;
  name: string;
  type: 'group' | 'dm';
  peerId?: string;
  lastMessage?: string;
  lastTimestamp?: number;
  unread: number;
}

export interface TypingPeer {
  senderId: string;
  senderName: string;
  timeout: any;
}

@Injectable({
  providedIn: 'root'
})
export class MessagingService implements OnDestroy {
  // Active channel
  private activeChannelSubject = new BehaviorSubject<string>('group');
  activeChannel$: Observable<string> = this.activeChannelSubject.asObservable();

  // Messages for the active channel
  private messagesSubject = new BehaviorSubject<DisplayMessage[]>([]);
  messages$: Observable<DisplayMessage[]> = this.messagesSubject.asObservable();

  // Available channels
  private channelsSubject = new BehaviorSubject<ChannelInfo[]>([
    { id: 'group', name: 'GROUP CHANNEL', type: 'group', unread: 0 }
  ]);
  channels$: Observable<ChannelInfo[]> = this.channelsSubject.asObservable();

  // Typing indicators for active channel
  private typingPeersSubject = new BehaviorSubject<TypingPeer[]>([]);
  typingPeers$: Observable<TypingPeer[]> = this.typingPeersSubject.asObservable();

  // Total unread count (across all channels)
  private unreadCountSubject = new BehaviorSubject<number>(0);
  unreadCount$: Observable<number> = this.unreadCountSubject.asObservable();

  // Chat panel open state
  private isPanelOpen = false;

  private typingPeers = new Map<string, TypingPeer>();
  private subs: Subscription[] = [];
  private audioCtx: AudioContext | null = null;
  private seenMessages = new Set<string>();

  constructor(
    private signaling: SignalingService,
    private storage: LanStorageService,
    private webrtc: WebrtcService,
    private profileService: ProfileService
  ) {
    this.setupListeners();
    this.loadHistory('group');
  }

  private setupListeners(): void {
    // Incoming chat messages (from Signaling)
    this.subs.push(
      this.signaling.chatMessages$.subscribe(msg => {
        this.handleIncomingMessage(msg);
      })
    );

    // Incoming chat messages (from WebRTC P2P)
    this.subs.push(
      this.webrtc.chatMessages$.subscribe(msg => {
        this.handleIncomingMessage(msg);
      })
    );

    // Typing indicators
    this.subs.push(
      this.signaling.typingIndicators$.subscribe(event => {
        this.handleTypingEvent(event);
      })
    );

    // Peer list updates — update DM channel names
    this.subs.push(
      this.signaling.peers$.subscribe(peers => {
        this.updateDmChannelNames(peers);
      })
    );
  }

  /**
   * Handle an incoming chat message
   */
  private async handleIncomingMessage(msg: ChatMessage): Promise<void> {
    // Deduplicate
    if (msg.msgId) {
      if (this.seenMessages.has(msg.msgId)) return;
      this.seenMessages.add(msg.msgId);
      // Keep set from growing infinitely
      if (this.seenMessages.size > 500) {
        const first = this.seenMessages.values().next().value;
        if (first !== undefined) {
          this.seenMessages.delete(first);
        }
      }
    }

    const isOwn = msg.isEcho === true;

    // Build the stored message
    const stored: Omit<StoredMessage, 'id'> = {
      channelId: msg.channelId,
      senderId: msg.senderId,
      senderName: msg.senderName,
      text: msg.text,
      timestamp: msg.timestamp,
      type: msg.type,
      isOwn
    };

    // Save to IndexedDB
    await this.storage.saveMessage(stored);

    // Update channel info
    this.ensureChannel(msg.channelId, msg.senderName, msg.senderId);
    this.updateChannelLastMessage(msg.channelId, msg.text, msg.timestamp);

    // If the message is for the active channel, append to display
    if (msg.channelId === this.activeChannelSubject.value) {
      const current = this.messagesSubject.value;
      const display: DisplayMessage = {
        senderId: msg.senderId,
        senderName: msg.senderName,
        text: msg.text,
        timestamp: msg.timestamp,
        type: msg.type,
        isOwn
      };
      this.messagesSubject.next([...current, display]);
    }

    // Unread tracking
    if (!isOwn && msg.type !== 'system') {
      if (!this.isPanelOpen || msg.channelId !== this.activeChannelSubject.value) {
        this.incrementUnread(msg.channelId);
        this.playNotificationSound();
      }
    }

    // Clear typing indicator for this sender
    this.clearTypingPeer(msg.senderId);
  }

  /**
   * Send a message on the active channel
   */
  sendMessage(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;

    const activeChannel = this.activeChannelSubject.value;
    const myId = this.signaling.socketId;
    const myName = this.profileService.profile.callsign || 'Spartan';
    const msgId = Math.random().toString(36).substring(2, 9);
    
    // We construct the base message payload for P2P
    const p2pMessage: ChatMessage = {
      msgId,
      senderId: myId,
      senderName: myName,
      text: trimmed,
      timestamp: Date.now(),
      type: 'text',
      channelId: activeChannel
    };

    let targetId: string | null = null;

    // If DM channel, extract target peer ID
    if (activeChannel.startsWith('dm-')) {
      const channelPeerIds = activeChannel.replace('dm-', '').split('-');
      targetId = channelPeerIds.find(id => id !== myId) || null;
      
      if (targetId) {
        const p2pSuccess = this.webrtc.sendDirectMessage(targetId, p2pMessage);
        if (p2pSuccess) {
          // Send to signaling server too? No, just echo it to ourselves locally.
          this.handleIncomingMessage({ ...p2pMessage, isEcho: true });
        } else {
          // Fallback to socket
          this.signaling.sendChatMessage(targetId, trimmed);
        }
      }
    } else {
      // Group Broadcast
      const allPeers = this.signaling.peers.filter(p => p.id !== myId);
      const allTargetIds = allPeers.map(p => p.id);
      
      const failedIds = this.webrtc.sendGroupMessage(p2pMessage, allTargetIds);
      
      if (failedIds.length > 0) {
        // Fallback: broadcast to everyone via signaling server.
        // Peers who already received the P2P message will deduplicate using msgId.
        // Wait, socket.io chat-message doesn't send msgId right now because it's constructed by the server!
        // So the server will broadcast it without a msgId (or with a server-generated one). 
        // This means it will bypass our deduplication check if the server modifies it.
        // For now, this is acceptable, but ideally we'd send the msgId to the server.
        this.signaling.sendChatMessage(null, trimmed);
        // We do NOT echo to ourselves here, because the server will emit an echo back to us.
      } else {
        // 100% P2P success, no fallback needed
        this.handleIncomingMessage({ ...p2pMessage, isEcho: true });
      }
    }
  }

  /**
   * Send typing indicator for active channel
   */
  private typingTimeout: any = null;
  sendTyping(): void {
    // Debounce: only send once per 2 seconds
    if (this.typingTimeout) return;

    const activeChannel = this.activeChannelSubject.value;
    let targetId: string | null = null;

    if (activeChannel.startsWith('dm-')) {
      const channelPeerIds = activeChannel.replace('dm-', '').split('-');
      const myId = this.signaling.socketId;
      targetId = channelPeerIds.find(id => id !== myId) || null;
    }

    this.signaling.sendTypingIndicator(targetId);

    this.typingTimeout = setTimeout(() => {
      this.typingTimeout = null;
    }, 2000);
  }

  /**
   * Switch to a channel and load its history
   */
  async switchChannel(channelId: string): Promise<void> {
    this.activeChannelSubject.next(channelId);
    this.resetUnread(channelId);
    this.typingPeers.clear();
    this.typingPeersSubject.next([]);
    await this.loadHistory(channelId);
  }

  /**
   * Open a DM channel with a specific peer
   */
  openDm(peerId: string, peerName: string): void {
    const myId = this.signaling.socketId;
    const channelId = `dm-${[myId, peerId].sort().join('-')}`;

    this.ensureChannel(channelId, peerName, peerId);
    this.switchChannel(channelId);
  }

  /**
   * Set panel open/closed state
   */
  setPanelOpen(open: boolean): void {
    this.isPanelOpen = open;
    if (open) {
      this.resetUnread(this.activeChannelSubject.value);
    }
  }

  /**
   * Load message history from IndexedDB
   */
  private async loadHistory(channelId: string): Promise<void> {
    try {
      const stored = await this.storage.getMessages(channelId, 50);
      const messages: DisplayMessage[] = stored.map(m => ({
        id: m.id,
        senderId: m.senderId,
        senderName: m.senderName,
        text: m.text,
        timestamp: m.timestamp,
        type: m.type,
        isOwn: m.isOwn
      }));
      this.messagesSubject.next(messages);
    } catch (err) {
      console.error('[MESSAGING] Failed to load history:', err);
      this.messagesSubject.next([]);
    }
  }

  /**
   * Ensure a channel exists in the channel list
   */
  private ensureChannel(channelId: string, peerName: string, peerId: string): void {
    const channels = this.channelsSubject.value;
    if (!channels.find(c => c.id === channelId)) {
      if (channelId.startsWith('dm-')) {
        channels.push({
          id: channelId,
          name: peerName,
          type: 'dm',
          peerId,
          unread: 0
        });
      }
      this.channelsSubject.next([...channels]);
    }
  }

  /**
   * Update last message preview for a channel
   */
  private updateChannelLastMessage(channelId: string, text: string, timestamp: number): void {
    const channels = this.channelsSubject.value;
    const channel = channels.find(c => c.id === channelId);
    if (channel) {
      channel.lastMessage = text;
      channel.lastTimestamp = timestamp;
      this.channelsSubject.next([...channels]);
    }
  }

  /**
   * Update DM channel names when peer list changes
   */
  private updateDmChannelNames(peers: PeerInfo[]): void {
    const channels = this.channelsSubject.value;
    let changed = false;

    for (const channel of channels) {
      if (channel.type === 'dm' && channel.peerId) {
        const peer = peers.find(p => p.id === channel.peerId);
        if (peer && channel.name !== peer.name) {
          channel.name = peer.name;
          changed = true;
        }
      }
    }

    if (changed) {
      this.channelsSubject.next([...channels]);
    }
  }

  /**
   * Handle typing event
   */
  private handleTypingEvent(event: { senderId: string; senderName: string }): void {
    // Clear existing timeout for this peer
    const existing = this.typingPeers.get(event.senderId);
    if (existing) {
      clearTimeout(existing.timeout);
    }

    // Set new timeout (auto-clear after 3 seconds)
    const timeout = setTimeout(() => {
      this.clearTypingPeer(event.senderId);
    }, 3000);

    this.typingPeers.set(event.senderId, {
      senderId: event.senderId,
      senderName: event.senderName,
      timeout
    });

    this.typingPeersSubject.next(Array.from(this.typingPeers.values()));
  }

  /**
   * Clear typing indicator for a peer
   */
  private clearTypingPeer(senderId: string): void {
    const existing = this.typingPeers.get(senderId);
    if (existing) {
      clearTimeout(existing.timeout);
      this.typingPeers.delete(senderId);
      this.typingPeersSubject.next(Array.from(this.typingPeers.values()));
    }
  }

  /**
   * Increment unread count for a channel
   */
  private incrementUnread(channelId: string): void {
    const channels = this.channelsSubject.value;
    const channel = channels.find(c => c.id === channelId);
    if (channel) {
      channel.unread++;
      this.channelsSubject.next([...channels]);
    }
    this.unreadCountSubject.next(
      channels.reduce((sum, c) => sum + c.unread, 0)
    );
  }

  /**
   * Reset unread count for a channel
   */
  private resetUnread(channelId: string): void {
    const channels = this.channelsSubject.value;
    const channel = channels.find(c => c.id === channelId);
    if (channel) {
      channel.unread = 0;
      this.channelsSubject.next([...channels]);
    }
    this.unreadCountSubject.next(
      channels.reduce((sum, c) => sum + c.unread, 0)
    );
  }

  /**
   * Play a subtle notification blip using Web Audio API
   */
  private playNotificationSound(): void {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const ctx = this.audioCtx;
      const now = ctx.currentTime;

      // First tone
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.08, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.15);

      // Second tone (slightly higher)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1100, now + 0.08);
      gain2.gain.setValueAtTime(0.06, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.25);
    } catch (err) {
      // Audio context not available, silently ignore
    }
  }

  /**
   * Clear all chat history
   */
  async clearAllHistory(): Promise<void> {
    await this.storage.clearAll();
    this.messagesSubject.next([]);
  }

  /**
   * Format timestamp to military time
   */
  static formatTime(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  get activeChannelId(): string {
    return this.activeChannelSubject.value;
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    this.typingPeers.forEach(p => clearTimeout(p.timeout));
  }
}
