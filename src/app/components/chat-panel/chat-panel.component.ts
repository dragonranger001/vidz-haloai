import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { OpenAiService, ChatMessage } from '../../services/openai.service';
import { ThemeService, HaloTheme, ThemePersonality } from '../../services/theme.service';

@Component({
  selector: 'app-chat-panel',
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-panel.component.html',
  styleUrl: './chat-panel.component.css'
})
export class ChatPanelComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messageList') messageListRef!: ElementRef<HTMLDivElement>;

  isOpen = true;
  messages: ChatMessage[] = [];
  isTyping = false;
  typingText = 'Processing...';
  messageInput = '';
  personality!: ThemePersonality;
  themeIcon = '◈';

  private subs: Subscription[] = [];
  private shouldScrollToBottom = false;

  constructor(
    private aiService: OpenAiService,
    private themeService: ThemeService
  ) {
    this.personality = this.themeService.currentTheme.personality;
    this.themeIcon = this.themeService.currentTheme.icon;
  }

  ngOnInit(): void {
    this.subs.push(
      this.aiService.messages$.subscribe(msgs => {
        this.messages = msgs;
        this.shouldScrollToBottom = true;
      }),
      this.aiService.isTyping$.subscribe(typing => {
        this.isTyping = typing;
        if (typing) this.shouldScrollToBottom = true;
      }),
      this.aiService.typingText$.subscribe(text => {
        this.typingText = text;
      }),
      this.themeService.currentTheme$.subscribe(theme => {
        this.personality = theme.personality;
        this.themeIcon = theme.icon;
      })
    );
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  togglePanel(): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.shouldScrollToBottom = true;
    }
  }

  sendMessage(): void {
    if (!this.messageInput.trim() || this.isTyping) return;
    this.aiService.sendMessage(this.messageInput);
    this.messageInput = '';
  }

  onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  formatTime(ts: number): string {
    const date = new Date(ts);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  trackMessage(index: number, msg: ChatMessage): string {
    return `${msg.timestamp}-${index}`;
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
