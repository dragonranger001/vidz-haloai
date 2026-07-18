import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatPanelComponent } from './components/chat-panel/chat-panel.component';
import { LanChatPanelComponent } from './components/lan-chat-panel/lan-chat-panel.component';
import { HudHeaderComponent } from './components/hud-header/hud-header.component';
import { ApiSettingsComponent } from './components/api-settings/api-settings.component';
import { ThemeService, ThemePersonality } from './services/theme.service';
import { Subscription } from 'rxjs';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  angle: number;
  rotSpeed: number;
  shape: string; // 'circle', 'square', 'triangle', 'char', 'line', 'wave', 'glow'
  char?: string;
  pulseSpeed?: number;
  pulseTime?: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ChatPanelComponent, LanChatPanelComponent, HudHeaderComponent, ApiSettingsComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  title = 'halo-ai';
  personality!: ThemePersonality;
  themeIcon = '⬡';
  currentThemeId = 'classic';
  currentThemePreview = '#00f5ff';

  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D | null;
  private animationFrameId!: number;
  private particles: Particle[] = [];
  private sub!: Subscription;

  constructor(private themeService: ThemeService) {
    this.personality = this.themeService.currentTheme.personality;
    this.themeIcon = this.themeService.currentTheme.icon;
    this.currentThemeId = this.themeService.currentTheme.id;
    this.currentThemePreview = this.themeService.currentTheme.preview;
  }

  ngOnInit() {
    this.sub = this.themeService.currentTheme$.subscribe(theme => {
      this.personality = theme.personality;
      this.themeIcon = theme.icon;
      this.currentThemeId = theme.id;
      this.currentThemePreview = theme.preview;
      this.initParticles();
    });
  }

  ngAfterViewInit() {
    this.canvas = document.getElementById('particles-canvas') as HTMLCanvasElement;
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
      this.resizeCanvas();
      window.addEventListener('resize', this.resizeCanvas.bind(this));
      this.initParticles();
      this.loop();
    }
  }

  ngOnDestroy() {
    if (this.sub) {
      this.sub.unsubscribe();
    }
    window.removeEventListener('resize', this.resizeCanvas.bind(this));
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  private resizeCanvas() {
    if (this.canvas) {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      this.initParticles();
    }
  }

  private initParticles() {
    if (!this.canvas) return;
    this.particles = [];
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    // Choose particle count based on theme
    let count = 40;
    if (this.currentThemeId === 'odst' || this.currentThemeId === 'army' || this.currentThemeId === 'flood') {
      count = 75;
    } else if (this.currentThemeId === 'banished' || this.currentThemeId === 'oni' || this.currentThemeId === 'insurrectionist') {
      count = 55;
    } else if (this.currentThemeId === 'forerunner' || this.currentThemeId === 'precursor' || this.currentThemeId === 'covenant') {
      count = 25;
    }

    const color = this.currentThemePreview;

    for (let i = 0; i < count; i++) {
      this.particles.push(this.createParticle(w, h, color, true));
    }
  }

  private createParticle(w: number, h: number, color: string, initRandomPos: boolean = false): Particle {
    const x = initRandomPos ? Math.random() * w : (Math.random() * w);
    
    // Y position logic: depending on direction
    let y = Math.random() * h;
    if (!initRandomPos) {
      if (this.currentThemeId === 'banished' || this.currentThemeId === 'cortana') {
        y = h + 10; // start at bottom for rising embers/blocks
      } else if (this.currentThemeId === 'odst' || this.currentThemeId === 'oni' || this.currentThemeId === 'insurrectionist') {
        y = -10; // start at top for falling rain/matrix
      }
    }

    let vx = (Math.random() - 0.5) * 0.4;
    let vy = (Math.random() - 0.5) * 0.4;
    let size = Math.random() * 2 + 1.5;
    let shape = 'circle';
    let char = '';

    // Apply specific theme physics / properties
    switch (this.currentThemeId) {
      case 'odst':
        vx = 1.0 + Math.random() * 0.5; // slant right
        vy = 4.0 + Math.random() * 2.0; // fall fast
        size = Math.random() * 1.5 + 1.0;
        shape = 'line';
        break;

      case 'banished':
        vx = (Math.random() - 0.5) * 0.6;
        vy = -1.5 - Math.random() * 2.0; // rise fast
        size = Math.random() * 2.0 + 1.0;
        shape = 'ember';
        break;

      case 'oni':
        vx = 0;
        vy = 1.5 + Math.random() * 1.5; // steady drop
        size = Math.random() * 4 + 10; // font size
        shape = 'binary';
        char = Math.random() > 0.5 ? '1' : '0';
        break;

      case 'covenant':
      case 'cortana':
        vx = (Math.random() - 0.5) * 0.3;
        vy = -0.3 - Math.random() * 0.5; // slow float up
        size = Math.random() * 6 + 4;
        shape = this.currentThemeId === 'cortana' ? 'rect' : 'glow';
        break;

      case 'forerunner':
        vx = (Math.random() - 0.5) * 0.5;
        vy = (Math.random() - 0.5) * 0.5;
        size = Math.random() * 5 + 4;
        shape = Math.random() > 0.5 ? 'triangle' : 'square';
        break;

      case 'precursor':
        vx = 0.3 + Math.random() * 0.5;
        vy = (Math.random() - 0.5) * 0.2;
        size = Math.random() * 1.5 + 1;
        shape = 'wave';
        break;

      case 'flood':
        // Jittery random brownian motion
        vx = (Math.random() - 0.5) * 1.5;
        vy = (Math.random() - 0.5) * 1.5;
        size = Math.random() * 3 + 2;
        shape = 'spore';
        break;

      case 'army':
        vx = 2.5 + Math.random() * 2.5; // fast horizontal dust
        vy = (Math.random() - 0.5) * 0.4;
        size = Math.random() * 1.5 + 0.5;
        shape = 'circle';
        break;

      case 'airforce':
        vx = 4.0 + Math.random() * 4.0; // supersonic horizontal line
        vy = 0;
        size = Math.random() * 15 + 15; // line length
        shape = 'jetstreak';
        break;

      case 'marines':
        vx = (Math.random() - 0.5) * 0.2;
        vy = (Math.random() - 0.5) * 0.2;
        size = Math.random() * 6 + 6; // bracket size
        shape = 'bracket';
        break;

      case 'ancient-human':
        // Orbit parameters
        vx = Math.random() * Math.PI * 2; // initial angle
        vy = Math.random() * 0.005 + 0.002; // angular velocity
        size = Math.random() * 2 + 1;
        shape = 'orbit';
        break;

      case 'noble':
      case 'navy':
        vx = (Math.random() - 0.5) * 0.2;
        vy = (Math.random() - 0.5) * 0.2;
        size = Math.random() * 2.5 + 1.5;
        shape = 'sonar';
        break;
      
      default:
        // HUD network dot
        vx = (Math.random() - 0.5) * 0.4;
        vy = (Math.random() - 0.5) * 0.4;
        size = Math.random() * 2 + 1.5;
        shape = 'circle';
        break;
    }

    return {
      x,
      y,
      vx,
      vy,
      size,
      color,
      alpha: Math.random() * 0.4 + 0.25,
      angle: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.02,
      shape,
      char,
      pulseSpeed: Math.random() * 0.02 + 0.01,
      pulseTime: Math.random() * 10
    };
  }

  private loop() {
    this.draw();
    this.animationFrameId = requestAnimationFrame(this.loop.bind(this));
  }

  private draw() {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    ctx.clearRect(0, 0, w, h);

    const theme = this.currentThemeId;
    const color = this.currentThemePreview;

    // 1. Render lines for grid/HUD-based themes
    if (theme === 'classic' || theme === 'noble' || theme === 'navy' || theme === 'marines' || theme === 'infinite') {
      ctx.beginPath();
      ctx.strokeStyle = color;
      for (let i = 0; i < this.particles.length; i++) {
        const p1 = this.particles[i];
        for (let j = i + 1; j < this.particles.length; j++) {
          const p2 = this.particles[j];
          const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
          if (dist < 100) {
            const alpha = (1 - dist / 100) * 0.15;
            ctx.strokeStyle = `rgba(${this.hexToRgb(color)}, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
          }
        }
      }
      ctx.stroke();
    }

    // 2. Update and render particles
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.pulseTime! += p.pulseSpeed!;

      // Particle physics update
      switch (p.shape) {
        case 'orbit':
          // x is current angle, vy is angular velocity
          p.angle += p.vy; 
          const radius = (p.size * 50) + (i * 4); // orbit radius based on index
          p.x = w / 2 + Math.cos(p.angle) * radius;
          p.y = h / 2 + Math.sin(p.angle) * radius;
          break;

        case 'spore':
          // Brownian motion jitter
          p.x += p.vx + (Math.random() - 0.5) * 1.5;
          p.y += p.vy + (Math.random() - 0.5) * 1.5;
          break;

        case 'wave':
          // Sine wave path
          p.x += p.vx;
          p.y = (h / 2) + Math.sin(p.x * 0.01 + p.angle) * 80 + (p.vy * h * 0.1);
          break;

        default:
          p.x += p.vx;
          p.y += p.vy;
          p.angle += p.rotSpeed;
          break;
      }

      // Wrap-around constraints
      if (p.shape === 'orbit') {
        // Orbit wraps in angle automatically, no wrap constraint needed
      } else if (p.shape === 'line' || p.shape === 'binary' || p.shape === 'ember' || p.shape === 'rect') {
        // Vertical or slanted wrap
        if (p.y < -20 || p.y > h + 20 || p.x < -20 || p.x > w + 20) {
          this.particles[i] = this.createParticle(w, h, color, false);
        }
      } else {
        // Default standard boundary wrap
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;
      }

      // Draw particle based on shape
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      
      const rgb = this.hexToRgb(p.color || color);
      const alphaPulse = p.alpha * (0.7 + Math.sin(p.pulseTime!) * 0.3);

      switch (p.shape) {
        case 'line':
          ctx.strokeStyle = `rgba(${rgb}, ${alphaPulse * 0.6})`;
          ctx.lineWidth = p.size;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-p.vx * 3, -p.vy * 3);
          ctx.stroke();
          break;

        case 'ember':
          // Glowing flame spark
          const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size * 3);
          grad.addColorStop(0, `rgba(${rgb}, ${alphaPulse})`);
          grad.addColorStop(0.3, `rgba(${rgb}, ${alphaPulse * 0.8})`);
          grad.addColorStop(1, 'rgba(255, 0, 0, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 3, 0, Math.PI * 2);
          ctx.fill();
          break;

        case 'binary':
          ctx.fillStyle = `rgba(${rgb}, ${alphaPulse * 0.75})`;
          ctx.font = `600 ${p.size}px 'Rajdhani', sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(p.char!, 0, 0);
          // Periodically glitch characters
          if (Math.random() < 0.01) {
            p.char = p.char === '1' ? '0' : '1';
          }
          break;

        case 'rect':
          ctx.fillStyle = `rgba(${rgb}, ${alphaPulse * 0.5})`;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          break;

        case 'glow':
          // Soft plasma halo
          const glowGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size * 2);
          glowGrad.addColorStop(0, `rgba(${rgb}, ${alphaPulse})`);
          glowGrad.addColorStop(0.5, `rgba(${rgb}, ${alphaPulse * 0.4})`);
          glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = glowGrad;
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 2, 0, Math.PI * 2);
          ctx.fill();
          break;

        case 'triangle':
          ctx.strokeStyle = `rgba(${rgb}, ${alphaPulse * 0.5})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(0, -p.size);
          ctx.lineTo(p.size, p.size);
          ctx.lineTo(-p.size, p.size);
          ctx.closePath();
          ctx.stroke();
          break;

        case 'square':
          ctx.strokeStyle = `rgba(${rgb}, ${alphaPulse * 0.5})`;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(-p.size / 2, -p.size / 2, p.size, p.size);
          break;

        case 'bracket':
          ctx.strokeStyle = `rgba(${rgb}, ${alphaPulse * 0.6})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          // Draw brackets [ ]
          ctx.moveTo(-p.size / 2 + 3, -p.size / 2);
          ctx.lineTo(-p.size / 2, -p.size / 2);
          ctx.lineTo(-p.size / 2, p.size / 2);
          ctx.lineTo(-p.size / 2 + 3, p.size / 2);
          
          ctx.moveTo(p.size / 2 - 3, -p.size / 2);
          ctx.lineTo(p.size / 2, -p.size / 2);
          ctx.lineTo(p.size / 2, p.size / 2);
          ctx.lineTo(p.size / 2 - 3, p.size / 2);
          ctx.stroke();
          break;

        case 'jetstreak':
          ctx.strokeStyle = `rgba(${rgb}, ${alphaPulse * 0.25})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-p.size, 0);
          ctx.stroke();
          break;

        case 'sonar':
          // Draw core dot
          ctx.fillStyle = `rgba(${rgb}, ${alphaPulse})`;
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
          // Draw expanding sonar ring
          const ringRad = (p.pulseTime! % 30) * 1.5;
          ctx.strokeStyle = `rgba(${rgb}, ${Math.max(0, 1 - (ringRad / 45)) * 0.25})`;
          ctx.lineWidth = 0.75;
          ctx.beginPath();
          ctx.arc(0, 0, ringRad, 0, Math.PI * 2);
          ctx.stroke();
          break;

        default:
          ctx.fillStyle = `rgba(${rgb}, ${alphaPulse})`;
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
      }

      ctx.restore();
    }
  }

  private hexToRgb(hex: string): string {
    // Strip # if present
    hex = hex.replace('#', '');
    
    // Parse shorthand like "abc" -> "aabbcc"
    if (hex.length === 3) {
      hex = hex.split('').map(s => s + s).join('');
    }
    
    const num = parseInt(hex, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    
    return `${r}, ${g}, ${b}`;
  }
}
