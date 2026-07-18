import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { ProfileService } from './profile.service';

export interface PeerInfo {
  id: string;
  name: string;
  ip: string;
  joinedAt: number;
}

export interface SignalOffer {
  senderId: string;
  senderName: string;
  offer: RTCSessionDescriptionInit;
}

export interface SignalAnswer {
  senderId: string;
  answer: RTCSessionDescriptionInit;
}

export interface SignalIce {
  senderId: string;
  candidate: RTCIceCandidateInit;
}

export interface FileRequest {
  senderId: string;
  senderName: string;
  fileName: string;
  fileSize: number;
  fileType: string;
}

export interface ChatMessage {
  msgId?: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  type: 'text' | 'system';
  channelId: string;
  isEcho?: boolean;
}

export interface TypingEvent {
  senderId: string;
  senderName: string;
}

@Injectable({
  providedIn: 'root'
})
export class SignalingService {

  private socket: Socket | null = null;
  private signalingUrl = '';

  // State subjects
  private connectedSubject = new BehaviorSubject<boolean>(false);
  private myInfoSubject = new BehaviorSubject<PeerInfo | null>(null);
  private peersSubject = new BehaviorSubject<PeerInfo[]>([]);
  private offersSubject = new Subject<SignalOffer>();
  private answersSubject = new Subject<SignalAnswer>();
  private iceCandidatesSubject = new Subject<SignalIce>();
  private fileRequestsSubject = new Subject<FileRequest>();
  private fileResponseSubject = new Subject<{ senderId: string; accepted: boolean }>();
  private chatMessageSubject = new Subject<ChatMessage>();
  private typingSubject = new Subject<TypingEvent>();

  constructor(private ngZone: NgZone, private profileService: ProfileService) {}

  // Public observables
  connected$: Observable<boolean> = this.connectedSubject.asObservable();
  myInfo$: Observable<PeerInfo | null> = this.myInfoSubject.asObservable();
  peers$: Observable<PeerInfo[]> = this.peersSubject.asObservable();
  offers$: Observable<SignalOffer> = this.offersSubject.asObservable();
  answers$: Observable<SignalAnswer> = this.answersSubject.asObservable();
  iceCandidates$: Observable<SignalIce> = this.iceCandidatesSubject.asObservable();
  fileRequests$: Observable<FileRequest> = this.fileRequestsSubject.asObservable();
  fileResponses$: Observable<{ senderId: string; accepted: boolean }> = this.fileResponseSubject.asObservable();
  chatMessages$: Observable<ChatMessage> = this.chatMessageSubject.asObservable();
  typingIndicators$: Observable<TypingEvent> = this.typingSubject.asObservable();

  get socketId(): string {
    return this.socket?.id || '';
  }

  get peers(): PeerInfo[] {
    return this.peersSubject.value;
  }

  /**
   * Connect to a signaling server (local or remote peer's server)
   */
  connect(serverUrl: string, displayName?: string): void {
    if (this.socket?.connected) {
      this.disconnect();
    }

    this.signalingUrl = serverUrl;
    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 5000,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    this.socket.on('connect', () => {
      console.log('[SIGNAL] Connected to signaling server:', serverUrl);
      this.ngZone.run(() => {
        this.connectedSubject.next(true);
      });

      // Register with the server
      this.socket!.emit('register', {
        name: displayName || this.profileService.callsign,
        clientType: 'halo-ai'
      });
    });

    this.socket.on('registered', (info: PeerInfo) => {
      console.log('[SIGNAL] Registered as:', info);
      this.ngZone.run(() => {
        this.myInfoSubject.next(info);
      });
    });

    this.socket.on('peers-updated', (peers: PeerInfo[]) => {
      // Filter out self
      const myId = this.socket?.id;
      const otherPeers = peers.filter(p => p.id !== myId);
      this.ngZone.run(() => {
        this.peersSubject.next(otherPeers);
      });
    });

    this.socket.on('signal-offer', (data: SignalOffer) => {
      this.ngZone.run(() => {
        this.offersSubject.next(data);
      });
    });

    this.socket.on('signal-answer', (data: SignalAnswer) => {
      this.ngZone.run(() => {
        this.answersSubject.next(data);
      });
    });

    this.socket.on('signal-ice', (data: SignalIce) => {
      this.ngZone.run(() => {
        this.iceCandidatesSubject.next(data);
      });
    });

    this.socket.on('file-request', (data: FileRequest) => {
      this.ngZone.run(() => {
        this.fileRequestsSubject.next(data);
      });
    });

    this.socket.on('file-response', (data: { senderId: string; accepted: boolean }) => {
      this.ngZone.run(() => {
        this.fileResponseSubject.next(data);
      });
    });

    this.socket.on('chat-message', (data: ChatMessage) => {
      this.ngZone.run(() => {
        this.chatMessageSubject.next(data);
      });
    });

    this.socket.on('chat-typing', (data: TypingEvent) => {
      this.ngZone.run(() => {
        this.typingSubject.next(data);
      });
    });

    this.socket.on('disconnect', () => {
      console.log('[SIGNAL] Disconnected from signaling server');
      this.ngZone.run(() => {
        this.connectedSubject.next(false);
      });
    });

    this.socket.on('connect_error', (err: Error) => {
      console.error('[SIGNAL] Connection error:', err.message);
      this.ngZone.run(() => {
        this.connectedSubject.next(false);
      });
    });
  }

  /**
   * Disconnect from the signaling server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connectedSubject.next(false);
      this.peersSubject.next([]);
      this.myInfoSubject.next(null);
    }
  }

  /**
   * Send WebRTC SDP offer to a specific peer
   */
  sendOffer(targetId: string, offer: RTCSessionDescriptionInit): void {
    this.socket?.emit('signal-offer', { targetId, offer });
  }

  /**
   * Send WebRTC SDP answer to a specific peer
   */
  sendAnswer(targetId: string, answer: RTCSessionDescriptionInit): void {
    this.socket?.emit('signal-answer', { targetId, answer });
  }

  /**
   * Send ICE candidate to a specific peer
   */
  sendIceCandidate(targetId: string, candidate: RTCIceCandidateInit): void {
    this.socket?.emit('signal-ice', { targetId, candidate });
  }

  /**
   * Send a file transfer request to a peer
   */
  sendFileRequest(targetId: string, fileName: string, fileSize: number, fileType: string): void {
    this.socket?.emit('file-request', { targetId, fileName, fileSize, fileType });
  }

  /**
   * Send file accept/reject response
   */
  sendFileResponse(targetId: string, accepted: boolean): void {
    this.socket?.emit('file-response', { targetId, accepted });
  }

  /**
   * Send a chat message (null targetId = broadcast to group)
   */
  sendChatMessage(targetId: string | null, text: string): void {
    this.socket?.emit('chat-message', { targetId, text });
  }

  /**
   * Send a typing indicator (null targetId = broadcast to group)
   */
  sendTypingIndicator(targetId: string | null): void {
    this.socket?.emit('chat-typing', { targetId });
  }
}
