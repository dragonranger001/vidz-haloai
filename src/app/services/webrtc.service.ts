import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Subject, Subscription, BehaviorSubject } from 'rxjs';
import { SignalingService, ChatMessage, SignalOffer, SignalAnswer, SignalIce, PeerInfo } from './signaling.service';
import { ProfileService } from './profile.service';

export interface PeerConnectionState {
  peerId: string;
  state: RTCIceConnectionState;
  isP2P: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class WebrtcService implements OnDestroy {
  private peerConnections = new Map<string, RTCPeerConnection>();
  private dataChannels = new Map<string, RTCDataChannel>();
  
  private connectionStatesSubject = new BehaviorSubject<Map<string, PeerConnectionState>>(new Map());
  connectionStates$ = this.connectionStatesSubject.asObservable();

  private chatMessageSubject = new Subject<ChatMessage>();
  chatMessages$ = this.chatMessageSubject.asObservable();

  private subs: Subscription[] = [];
  
  // Public STUN servers for NAT traversal
  private config: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  constructor(
    private signaling: SignalingService,
    private profileService: ProfileService,
    private ngZone: NgZone
  ) {
    this.setupSignalingListeners();
  }

  private setupSignalingListeners(): void {
    // 1. Listen for new peers joining (We initiate the offer)
    this.subs.push(
      this.signaling.peers$.subscribe(peers => {
        this.handlePeerListUpdate(peers);
      })
    );

    // 2. Listen for incoming Offers
    this.subs.push(
      this.signaling.offers$.subscribe(async offer => {
        await this.handleOffer(offer);
      })
    );

    // 3. Listen for incoming Answers
    this.subs.push(
      this.signaling.answers$.subscribe(async answer => {
        await this.handleAnswer(answer);
      })
    );

    // 4. Listen for incoming ICE Candidates
    this.subs.push(
      this.signaling.iceCandidates$.subscribe(async ice => {
        await this.handleIceCandidate(ice);
      })
    );

    // Clean up when disconnected from signaling server
    this.subs.push(
      this.signaling.connected$.subscribe(connected => {
        if (!connected) {
          this.closeAllConnections();
        }
      })
    );
  }

  private handlePeerListUpdate(peers: PeerInfo[]): void {
    const currentPeerIds = new Set(peers.map(p => p.id));

    // Remove stale connections
    for (const [peerId, pc] of this.peerConnections.entries()) {
      if (!currentPeerIds.has(peerId)) {
        this.closeConnection(peerId);
      }
    }

    // Create connections for new peers and send offers
    const myId = this.signaling.socketId;
    for (const peer of peers) {
      if (!this.peerConnections.has(peer.id) && peer.id > myId) {
        // Arbitrary rule to avoid crossing offers: highest ID initiates the offer
        this.initiateConnection(peer.id);
      }
    }
  }

  private getOrCreatePeerConnection(peerId: string): RTCPeerConnection {
    if (this.peerConnections.has(peerId)) {
      return this.peerConnections.get(peerId)!;
    }

    const pc = new RTCPeerConnection(this.config);
    this.peerConnections.set(peerId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signaling.sendIceCandidate(peerId, event.candidate);
      }
    };

    pc.oniceconnectionstatechange = () => {
      this.updateConnectionState(peerId, pc.iceConnectionState);
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
        this.closeConnection(peerId);
      }
    };

    // When the remote peer creates a data channel, we receive it here
    pc.ondatachannel = (event) => {
      this.setupDataChannel(peerId, event.channel);
    };

    this.updateConnectionState(peerId, pc.iceConnectionState);
    return pc;
  }

  private async initiateConnection(peerId: string): Promise<void> {
    const pc = this.getOrCreatePeerConnection(peerId);
    
    // Create the data channel before creating the offer
    const dc = pc.createDataChannel('chat', { negotiated: false });
    this.setupDataChannel(peerId, dc);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.signaling.sendOffer(peerId, offer);
    } catch (err) {
      console.error(`[WEBRTC] Error initiating connection to ${peerId}:`, err);
    }
  }

  private async handleOffer(signal: SignalOffer): Promise<void> {
    const { senderId, offer } = signal;
    const pc = this.getOrCreatePeerConnection(senderId);

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.signaling.sendAnswer(senderId, answer);
    } catch (err) {
      console.error(`[WEBRTC] Error handling offer from ${senderId}:`, err);
    }
  }

  private async handleAnswer(signal: SignalAnswer): Promise<void> {
    const { senderId, answer } = signal;
    const pc = this.peerConnections.get(senderId);
    if (!pc) return;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.error(`[WEBRTC] Error handling answer from ${senderId}:`, err);
    }
  }

  private async handleIceCandidate(signal: SignalIce): Promise<void> {
    const { senderId, candidate } = signal;
    const pc = this.peerConnections.get(senderId);
    if (!pc) return;

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error(`[WEBRTC] Error adding ICE candidate from ${senderId}:`, err);
    }
  }

  private setupDataChannel(peerId: string, dc: RTCDataChannel): void {
    this.dataChannels.set(peerId, dc);

    dc.onopen = () => {
      console.log(`[WEBRTC] DataChannel open with ${peerId}`);
      this.updateConnectionState(peerId, this.peerConnections.get(peerId)?.iceConnectionState || 'connected', true);
    };

    dc.onclose = () => {
      console.log(`[WEBRTC] DataChannel closed with ${peerId}`);
      this.dataChannels.delete(peerId);
      this.updateConnectionState(peerId, 'disconnected', false);
    };

    dc.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        // It's a chat message
        this.ngZone.run(() => {
          this.chatMessageSubject.next({
            senderId: peerId,
            senderName: parsed.senderName,
            text: parsed.text,
            timestamp: parsed.timestamp,
            type: parsed.type || 'text',
            channelId: parsed.channelId,
            isEcho: false
          });
        });
      } catch (err) {
        console.error(`[WEBRTC] Error parsing message from ${peerId}:`, err);
      }
    };
  }

  private updateConnectionState(peerId: string, state: RTCIceConnectionState, isP2POpen: boolean = false): void {
    const current = new Map(this.connectionStatesSubject.value);
    
    // If the channel is open, force isP2P to true regardless of ICE state (sometimes ICE stays checking while channel is open)
    const dataChannel = this.dataChannels.get(peerId);
    const isOpen = Boolean(isP2POpen || (dataChannel && dataChannel.readyState === 'open'));

    current.set(peerId, { peerId, state, isP2P: isOpen });
    this.ngZone.run(() => {
      this.connectionStatesSubject.next(current);
    });
  }

  private closeConnection(peerId: string): void {
    const dc = this.dataChannels.get(peerId);
    if (dc) {
      dc.close();
      this.dataChannels.delete(peerId);
    }

    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }

    const current = new Map(this.connectionStatesSubject.value);
    current.delete(peerId);
    this.connectionStatesSubject.next(current);
  }

  private closeAllConnections(): void {
    for (const peerId of this.peerConnections.keys()) {
      this.closeConnection(peerId);
    }
  }

  /**
   * Send a message to a specific peer over WebRTC.
   * Returns true if successful, false if it failed (so fallback can be used).
   */
  sendDirectMessage(targetId: string, message: any): boolean {
    const dc = this.dataChannels.get(targetId);
    if (dc && dc.readyState === 'open') {
      try {
        dc.send(JSON.stringify(message));
        return true;
      } catch (err) {
        console.error(`[WEBRTC] Failed to send message to ${targetId}:`, err);
        return false;
      }
    }
    return false;
  }

  /**
   * Send a message to all connected peers over WebRTC.
   * Returns a list of peerIds that FAILED to receive the message (for fallback).
   */
  sendGroupMessage(message: any, allTargetIds: string[]): string[] {
    const failedIds: string[] = [];
    const msgStr = JSON.stringify(message);

    for (const targetId of allTargetIds) {
      const dc = this.dataChannels.get(targetId);
      if (dc && dc.readyState === 'open') {
        try {
          dc.send(msgStr);
        } catch (err) {
          failedIds.push(targetId);
        }
      } else {
        failedIds.push(targetId);
      }
    }
    return failedIds;
  }

  /**
   * Check if a peer has an active WebRTC data channel
   */
  isPeerConnected(peerId: string): boolean {
    const dc = this.dataChannels.get(peerId);
    return dc !== undefined && dc.readyState === 'open';
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.closeAllConnections();
  }
}
