import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ThemeService, HaloTheme } from '../../services/theme.service';

@Component({
  selector: 'app-theme-selector',
  imports: [CommonModule],
  templateUrl: './theme-selector.component.html',
  styleUrl: './theme-selector.component.css'
})
export class ThemeSelectorComponent implements OnDestroy {
  isOpen = false;
  currentTheme: HaloTheme;
  themes: HaloTheme[];
  private sub: Subscription;

  constructor(private themeService: ThemeService) {
    this.themes = this.themeService.themes;
    this.currentTheme = this.themeService.currentTheme;
    this.sub = this.themeService.currentTheme$.subscribe(t => {
      this.currentTheme = t;
    });
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
  }

  selectTheme(theme: HaloTheme): void {
    this.themeService.setTheme(theme.id);
    this.isOpen = false;
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}
