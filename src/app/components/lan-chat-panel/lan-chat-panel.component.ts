import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MessagingService, DisplayMessage, ChannelInfo, TypingPeer } from '../../services/messaging.service';
import { SignalingService, PeerInfo } from '../../services/signaling.service';
import { LanStorageService, StoredBookmark } from '../../services/lan-storage.service';
import { ThemeService, HaloTheme } from '../../services/theme.service';
import { ProfileService } from '../../services/profile.service';
import { WebrtcService, PeerConnectionState } from '../../services/webrtc.service';

@Component({
  selector: 'app-lan-chat-panel',
  imports: [CommonModule, FormsModule],
  templateUrl: './lan-chat-panel.component.html',
  styleUrl: './lan-chat-panel.component.css'
})
export class LanChatPanelComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messageList') messageListRef!: ElementRef<HTMLDivElement>;

  isOpen = false;
  isChannelMenuOpen = false;

  messages: DisplayMessage[] = [];
  channels: ChannelInfo[] = [];
  typingPeers: TypingPeer[] = [];
  peers: PeerInfo[] = [];
  unreadCount = 0;
  activeChannel = 'group';
  messageInput = '';
  
  lanTitle = 'FRIENDLY COMS';
  lanFabLabel = 'FRIENDLY';

  // Connection state
  isConnected = false;
  serverUrl = '';
  peerStates: Map<string, PeerConnectionState> = new Map();

  // Bookmark state
  bookmarks: StoredBookmark[] = [];
  bookmarkedSet = new Set<string>(); // "channelId-timestamp-senderId" for quick lookup
  showBookmarks = false;

  private subs: Subscription[] = [];
  private shouldScrollToBottom = false;

  constructor(
    private messaging: MessagingService,
    private signaling: SignalingService,
    private storage: LanStorageService,
    private themeService: ThemeService,
    public profileService: ProfileService,
    private webrtc: WebrtcService
  ) {}

  ngOnInit(): void {
    this.subs.push(
      this.messaging.messages$.subscribe(msgs => {
        this.messages = msgs;
        this.shouldScrollToBottom = true;
      }),
      this.messaging.channels$.subscribe(ch => {
        this.channels = ch;
      }),
      this.messaging.typingPeers$.subscribe(tp => {
        this.typingPeers = tp;
      }),
      this.messaging.unreadCount$.subscribe(c => {
        this.unreadCount = c;
      }),
      this.messaging.activeChannel$.subscribe(ch => {
        this.activeChannel = ch;
        this.showBookmarks = false;
      }),
      this.signaling.peers$.subscribe(p => {
        this.peers = p;
      }),
      this.signaling.connected$.subscribe(connected => {
        this.isConnected = connected;
      }),
      this.themeService.currentTheme$.subscribe(theme => {
        this.updateThemeLabels(theme);
      }),
      this.webrtc.connectionStates$.subscribe(states => {
        this.peerStates = states;
      })
    );

    this.loadBookmarks();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  togglePanel(): void {
    this.isOpen = !this.isOpen;
    this.messaging.setPanelOpen(this.isOpen);
    if (this.isOpen) {
      this.shouldScrollToBottom = true;
    }
  }

  toggleChannelMenu(): void {
    this.isChannelMenuOpen = !this.isChannelMenuOpen;
  }

  selectChannel(channelId: string): void {
    this.messaging.switchChannel(channelId);
    this.isChannelMenuOpen = false;
    this.showBookmarks = false;
  }

  openDm(peer: PeerInfo): void {
    this.messaging.openDm(peer.id, peer.name);
    this.isChannelMenuOpen = false;
    this.showBookmarks = false;
  }

  connectToServer(): void {
    const url = this.serverUrl.trim();
    if (!url) return;
    this.signaling.connect(url);
  }

  disconnectFromServer(): void {
    this.signaling.disconnect();
  }

  sendMessage(): void {
    if (!this.messageInput.trim()) return;
    this.messaging.sendMessage(this.messageInput);
    this.messageInput = '';
  }

  onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    } else {
      this.messaging.sendTyping();
    }
  }

  getActiveChannelName(): string {
    if (this.showBookmarks) return 'BOOKMARKS';
    const ch = this.channels.find(c => c.id === this.activeChannel);
    return ch?.name || 'GROUP CHANNEL';
  }

  formatTime(ts: number): string {
    return MessagingService.formatTime(ts);
  }

  getPeerConnectionState(peerId: string): string {
    const state = this.peerStates.get(peerId);
    if (state && state.isP2P) return 'P2P';
    return 'RELAY';
  }

  trackMessage(index: number, msg: DisplayMessage): string {
    return `${msg.timestamp}-${msg.senderId}-${index}`;
  }

  trackChannel(index: number, ch: ChannelInfo): string {
    return ch.id;
  }

  private updateThemeLabels(theme: HaloTheme): void {
    const titles: Record<string, { title: string, fab: string }> = {
      'classic': { title: 'SPARTAN NET', fab: 'SPARTAN' },
      'odst': { title: 'HELLJUMPER COMM', fab: 'HELLJUMPER' },
      'covenant': { title: 'HIERARCH NET', fab: 'BATTLE NET' },
      'forerunner': { title: 'ECUMENE COMMS', fab: 'ECUMENE' },
      'noble': { title: 'NOBLE RELAY', fab: 'NOBLE' },
      'flood': { title: 'HIVE WHISPERS', fab: 'HIVE' },
      'banished': { title: 'WAR COUNCIL NET', fab: 'WAR CHIEF' },
      'cortana': { title: 'DOMAIN LINK', fab: 'MATRIX' },
      'infinite': { title: 'ZETA RELAY', fab: 'ZETA' },
      'insurrectionist': { title: 'REBEL COMMS', fab: 'REBEL' },
      'ancient-human': { title: 'CHARUM COMMS', fab: 'CHARUM' },
      'precursor': { title: 'NEURAL LINK', fab: 'NEURAL' },
      'marines': { title: 'MARINE COMMS', fab: 'MARINE' },
      'army': { title: 'ARMY RELAY', fab: 'ARMY' },
      'airforce': { title: 'SKYNET COMMS', fab: 'SKYNET' },
      'navy': { title: 'FLEETCOM', fab: 'FLEET' },
      'sanghelios': { title: 'SANGHEILI NET', fab: 'SANGHEILI' },
      'oni': { title: 'SECTION 3 NET', fab: 'SEC-3' },
      'ueg': { title: 'GOVNET RELAY', fab: 'GOVNET' },
      'bloodstars': { title: 'HUNTER COMMS', fab: 'HUNTER' },
      'silentshadow': { title: 'SHADOW NET', fab: 'SHADOW' }
    };
    
    const labels = titles[theme.id] || { title: 'FRIENDLY COMS', fab: 'FRIENDLY' };
    this.lanTitle = labels.title;
    this.lanFabLabel = labels.fab;
  }

  // ═══════════════════════════════════════════════════════════════════
  // BOOKMARKS
  // ═══════════════════════════════════════════════════════════════════

  private async loadBookmarks(): Promise<void> {
    try {
      this.bookmarks = await this.storage.getBookmarks();
      this.rebuildBookmarkSet();
    } catch (err) {
      console.error('[LAN-CHAT] Failed to load bookmarks:', err);
    }
  }

  private rebuildBookmarkSet(): void {
    this.bookmarkedSet.clear();
    for (const b of this.bookmarks) {
      this.bookmarkedSet.add(this.bookmarkKey(b.channelId, b.messageTimestamp, b.senderId));
    }
  }

  private bookmarkKey(channelId: string, timestamp: number, senderId: string): string {
    return `${channelId}-${timestamp}-${senderId}`;
  }

  isBookmarked(msg: DisplayMessage): boolean {
    return this.bookmarkedSet.has(this.bookmarkKey(this.activeChannel, msg.timestamp, msg.senderId));
  }

  async toggleBookmark(event: Event, msg: DisplayMessage): Promise<void> {
    event.stopPropagation();
    const key = this.bookmarkKey(this.activeChannel, msg.timestamp, msg.senderId);

    if (this.bookmarkedSet.has(key)) {
      // Remove bookmark
      const bookmark = this.bookmarks.find(b =>
        b.channelId === this.activeChannel &&
        b.messageTimestamp === msg.timestamp &&
        b.senderId === msg.senderId
      );
      if (bookmark?.id) {
        await this.storage.removeBookmark(bookmark.id);
      }
    } else {
      // Add bookmark
      await this.storage.saveBookmark({
        channelId: this.activeChannel,
        senderId: msg.senderId,
        senderName: msg.senderName,
        text: msg.text,
        messageTimestamp: msg.timestamp,
        bookmarkedAt: Date.now()
      });
    }

    await this.loadBookmarks();
  }

  showBookmarkView(): void {
    this.showBookmarks = true;
    this.isChannelMenuOpen = false;
  }

  async removeBookmark(event: Event, bookmark: StoredBookmark): Promise<void> {
    event.stopPropagation();
    if (bookmark.id) {
      await this.storage.removeBookmark(bookmark.id);
      await this.loadBookmarks();
    }
  }

  formatBookmarkTime(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();

    if (isToday) {
      return d.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    }) + ' ' + d.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private scrollToBottom(): void {
    try {
      if (this.messageListRef) {
        const el = this.messageListRef.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    } catch (e) {}
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }
}
