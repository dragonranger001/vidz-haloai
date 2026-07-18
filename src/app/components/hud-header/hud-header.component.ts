import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeSelectorComponent } from '../theme-selector/theme-selector.component';
import { ProfileSettingsComponent } from '../profile-settings/profile-settings.component';
import { ThemeService, HaloTheme, ThemePersonality } from '../../services/theme.service';
import { OpenAiService } from '../../services/openai.service';
import { ApiSettingsService } from '../../services/api-settings.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-hud-header',
  standalone: true,
  imports: [CommonModule, ThemeSelectorComponent, ProfileSettingsComponent],
  templateUrl: './hud-header.component.html',
  styleUrls: ['./hud-header.component.css']
})
export class HudHeaderComponent implements OnInit, OnDestroy {
  currentTime = '00:00:00';
  personality!: ThemePersonality;
  themeIcon = '⬡';
  aiTyping = false;
  apiConnected = false;

  private timer: any;
  private subs: Subscription[] = [];

  constructor(
    private themeService: ThemeService,
    private aiService: OpenAiService,
    private apiSettings: ApiSettingsService
  ) {
    this.personality = this.themeService.currentTheme.personality;
    this.themeIcon = this.themeService.currentTheme.icon;
  }

  ngOnInit(): void {
    this.updateTime();
    this.timer = setInterval(() => this.updateTime(), 1000);

    this.subs.push(
      this.themeService.currentTheme$.subscribe(theme => {
        this.personality = theme.personality;
        this.themeIcon = theme.icon;
      }),
      this.aiService.isTyping$.subscribe(typing => {
        this.aiTyping = typing;
      }),
      this.apiSettings.connectedStatus$.subscribe(status => {
        this.apiConnected = status;
      })
    );
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.subs.forEach(s => s.unsubscribe());
  }

  private updateTime(): void {
    const now = new Date();
    this.currentTime = now.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  openSettings(): void {
    // We will communicate with ApiSettingsComponent through a service or directly if using a shared state.
    // For simplicity, let's fire a custom event on document or use a simple service toggle if we have one.
    // Wait, it's better to just use a ViewChild or just trigger an event if the component is in the root.
    // Let's dispatch a custom event.
    document.dispatchEvent(new CustomEvent('toggle-api-settings'));
  }
}
