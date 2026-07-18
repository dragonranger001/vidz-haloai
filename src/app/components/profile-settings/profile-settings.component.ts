import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ProfileService } from '../../services/profile.service';
import { UserProfile } from '../../services/lan-storage.service';

@Component({
  selector: 'app-profile-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile-settings.component.html',
  styleUrl: './profile-settings.component.css'
})
export class ProfileSettingsComponent implements OnInit, OnDestroy {
  isOpen = false;
  profile!: UserProfile;
  editingCallsign = '';
  saved = false;

  private subs: Subscription[] = [];

  constructor(public profileService: ProfileService) {}

  ngOnInit(): void {
    this.subs.push(
      this.profileService.profile$.subscribe(p => {
        this.profile = p;
        this.editingCallsign = p.callsign;
      })
    );
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.editingCallsign = this.profile.callsign;
      this.saved = false;
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(): void {
    if (this.isOpen) {
      this.isOpen = false;
    }
  }

  async saveCallsign(): Promise<void> {
    if (this.editingCallsign.trim()) {
      await this.profileService.setCallsign(this.editingCallsign);
      this.saved = true;
      setTimeout(() => this.saved = false, 2000);
    }
  }

  async toggleSounds(): Promise<void> {
    await this.profileService.toggleNotifications();
  }

  async toggleAutoAccept(): Promise<void> {
    await this.profileService.toggleAutoAccept();
  }

  async setFontSize(size: 'small' | 'medium' | 'large'): Promise<void> {
    await this.profileService.setChatFontSize(size);
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }
}
