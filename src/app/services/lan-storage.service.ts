import { Injectable } from '@angular/core';

export interface StoredMessage {
  id?: number;
  channelId: string;        // 'group' or 'dm-{peerId}'
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  type: 'text' | 'system';
  isOwn: boolean;
}

export interface UserProfile {
  id: string;               // always 'default'
  callsign: string;
  notificationSounds: boolean;
  autoAcceptTransfers: boolean;
  chatFontSize: 'small' | 'medium' | 'large';
}

export interface StoredBookmark {
  id?: number;
  channelId: string;
  senderId: string;
  senderName: string;
  text: string;
  messageTimestamp: number;
  bookmarkedAt: number;
}

const DB_NAME = 'halo-ai-lan-db';
const DB_VERSION = 1;
const STORE_MESSAGES = 'messages';
const STORE_PROFILE = 'profile';
const STORE_BOOKMARKS = 'bookmarks';
const MAX_MESSAGES_PER_CHANNEL = 1000;

@Injectable({
  providedIn: 'root'
})
export class LanStorageService {
  private db: IDBDatabase | null = null;
  private dbReady: Promise<IDBDatabase>;

  constructor() {
    this.dbReady = this.initDB();
  }

  /**
   * Initialize IndexedDB with all stores
   */
  private initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Messages store
        if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
          const store = db.createObjectStore(STORE_MESSAGES, {
            keyPath: 'id',
            autoIncrement: true
          });
          store.createIndex('by-channel', 'channelId', { unique: false });
          store.createIndex('by-timestamp', 'timestamp', { unique: false });
          store.createIndex('by-channel-timestamp', ['channelId', 'timestamp'], { unique: false });
        }

        // Profile store
        if (!db.objectStoreNames.contains(STORE_PROFILE)) {
          db.createObjectStore(STORE_PROFILE, { keyPath: 'id' });
        }

        // Bookmarks store
        if (!db.objectStoreNames.contains(STORE_BOOKMARKS)) {
          const bookmarkStore = db.createObjectStore(STORE_BOOKMARKS, {
            keyPath: 'id',
            autoIncrement: true
          });
          bookmarkStore.createIndex('by-channel', 'channelId', { unique: false });
          bookmarkStore.createIndex('by-timestamp', 'bookmarkedAt', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        console.log('[LAN-STORAGE] IndexedDB initialized');
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('[LAN-STORAGE] IndexedDB error:', (event.target as IDBOpenDBRequest).error);
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // MESSAGES
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Save a message to IndexedDB
   */
  async saveMessage(message: Omit<StoredMessage, 'id'>): Promise<number> {
    const db = await this.dbReady;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MESSAGES, 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);
      const request = store.add(message);

      request.onsuccess = () => {
        const id = request.result as number;
        // Auto-prune after insert
        this.pruneChannel(message.channelId);
        resolve(id);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get messages for a channel, newest last, with limit
   */
  async getMessages(channelId: string, limit: number = 50): Promise<StoredMessage[]> {
    const db = await this.dbReady;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MESSAGES, 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('by-channel-timestamp');

      const range = IDBKeyRange.bound(
        [channelId, 0],
        [channelId, Number.MAX_SAFE_INTEGER]
      );

      const messages: StoredMessage[] = [];
      const request = index.openCursor(range, 'prev'); // newest first

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor && messages.length < limit) {
          messages.unshift(cursor.value); // prepend so oldest is first
          cursor.continue();
        } else {
          resolve(messages);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all messages
   */
  async clearAll(): Promise<void> {
    const db = await this.dbReady;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MESSAGES, 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Auto-prune: keep only MAX_MESSAGES_PER_CHANNEL newest messages
   */
  private async pruneChannel(channelId: string): Promise<void> {
    const db = await this.dbReady;

    const tx = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);
    const index = store.index('by-channel-timestamp');

    const range = IDBKeyRange.bound(
      [channelId, 0],
      [channelId, Number.MAX_SAFE_INTEGER]
    );

    // Count messages in this channel
    const countReq = index.count(range);

    countReq.onsuccess = () => {
      const count = countReq.result;
      if (count <= MAX_MESSAGES_PER_CHANNEL) return;

      const toDelete = count - MAX_MESSAGES_PER_CHANNEL;
      let deleted = 0;

      const cursorReq = index.openCursor(range, 'next'); // oldest first

      cursorReq.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor && deleted < toDelete) {
          cursor.delete();
          deleted++;
          cursor.continue();
        }
      };
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PROFILE
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Save or update user profile
   */
  async saveProfile(profile: UserProfile): Promise<void> {
    const db = await this.dbReady;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROFILE, 'readwrite');
      const store = tx.objectStore(STORE_PROFILE);
      const request = store.put(profile);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get user profile
   */
  async getProfile(): Promise<UserProfile | null> {
    const db = await this.dbReady;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROFILE, 'readonly');
      const store = tx.objectStore(STORE_PROFILE);
      const request = store.get('default');

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // BOOKMARKS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Save a bookmark
   */
  async saveBookmark(bookmark: Omit<StoredBookmark, 'id'>): Promise<number> {
    const db = await this.dbReady;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BOOKMARKS, 'readwrite');
      const store = tx.objectStore(STORE_BOOKMARKS);
      const request = store.add(bookmark);

      request.onsuccess = () => resolve(request.result as number);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all bookmarks (newest first)
   */
  async getBookmarks(limit: number = 100): Promise<StoredBookmark[]> {
    const db = await this.dbReady;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BOOKMARKS, 'readonly');
      const store = tx.objectStore(STORE_BOOKMARKS);
      const index = store.index('by-timestamp');
      const results: StoredBookmark[] = [];

      const request = index.openCursor(null, 'prev');

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Remove a bookmark
   */
  async removeBookmark(id: number): Promise<void> {
    const db = await this.dbReady;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BOOKMARKS, 'readwrite');
      const store = tx.objectStore(STORE_BOOKMARKS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all bookmarks
   */
  async clearBookmarks(): Promise<void> {
    const db = await this.dbReady;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BOOKMARKS, 'readwrite');
      const store = tx.objectStore(STORE_BOOKMARKS);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
