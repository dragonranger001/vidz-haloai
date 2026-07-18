import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { LanStorageService, UserProfile } from './lan-storage.service';

const DEFAULT_PROFILE: UserProfile = {
  id: 'default',
  callsign: '',
  notificationSounds: true,
  autoAcceptTransfers: false,
  chatFontSize: 'medium'
};

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private profileSubject = new BehaviorSubject<UserProfile>(DEFAULT_PROFILE);
  profile$: Observable<UserProfile> = this.profileSubject.asObservable();

  private loaded = false;

  constructor(private storage: LanStorageService) {
    this.loadProfile();
  }

  private async loadProfile(): Promise<void> {
    try {
      const saved = await this.storage.getProfile();
      if (saved) {
        this.profileSubject.next(saved);
      } else {
        const prefixes = ['RECLAIMER', 'ECHO', 'NOBLE', 'ORACLE', 'DEMON', 'GHOST', 'PHANTOM', 'CORSAIR', 'AEGIS', 'WRAITH'];
        const randomNum = Math.floor(Math.random() * 900) + 100; // 100 to 999
        const randomTag = `${prefixes[Math.floor(Math.random() * prefixes.length)]}-${randomNum}`;
        
        const newProfile = { ...DEFAULT_PROFILE, callsign: randomTag };
        await this.storage.saveProfile(newProfile);
        this.profileSubject.next(newProfile);
      }
      this.loaded = true;
    } catch (err) {
      console.error('[PROFILE] Failed to load profile:', err);
    }
  }

  get profile(): UserProfile {
    return this.profileSubject.value;
  }

  get callsign(): string {
    return this.profileSubject.value.callsign || 'OPERATIVE';
  }

  async updateProfile(updates: Partial<UserProfile>): Promise<void> {
    const current = this.profileSubject.value;
    const updated: UserProfile = { ...current, ...updates, id: 'default' };
    this.profileSubject.next(updated);

    try {
      await this.storage.saveProfile(updated);
      console.log('[PROFILE] Profile saved');
    } catch (err) {
      console.error('[PROFILE] Failed to save profile:', err);
    }
  }

  async setCallsign(tag: string): Promise<void> {
    await this.updateProfile({ callsign: tag.trim().toUpperCase() || 'OPERATIVE' });
  }

  async toggleNotifications(): Promise<void> {
    await this.updateProfile({ notificationSounds: !this.profile.notificationSounds });
  }

  async toggleAutoAccept(): Promise<void> {
    await this.updateProfile({ autoAcceptTransfers: !this.profile.autoAcceptTransfers });
  }

  async setChatFontSize(size: 'small' | 'medium' | 'large'): Promise<void> {
    await this.updateProfile({ chatFontSize: size });
  }
}
