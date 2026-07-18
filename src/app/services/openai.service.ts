import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ThemeService, ThemePersonality } from './theme.service';
import { ApiSettingsService } from './api-settings.service';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class OpenAiService {
  private messagesSubject = new BehaviorSubject<ChatMessage[]>([]);
  public messages$ = this.messagesSubject.asObservable();

  private isTypingSubject = new BehaviorSubject<boolean>(false);
  public isTyping$ = this.isTypingSubject.asObservable();

  private typingTextSubject = new BehaviorSubject<string>('Processing...');
  public typingText$ = this.typingTextSubject.asObservable();

  // Settings are now managed by ApiSettingsService
  private get apiUrl() { return this.apiSettings.activeEndpoint.url; }
  private get apiKey() { return this.apiSettings.activeEndpoint.apiKey; }

  private personality!: ThemePersonality;
  private hasGreeted = new Set<string>(); // Track which themes have shown greeting

  constructor(private themeService: ThemeService, private apiSettings: ApiSettingsService) {
    this.personality = this.themeService.currentTheme.personality;

    // Show initial greeting for the default theme
    this.showGreeting(this.personality);
    this.hasGreeted.add(this.themeService.currentTheme.id);

    // React to theme changes
    this.themeService.currentTheme$.subscribe(theme => {
      this.personality = theme.personality;

      // Show greeting for new theme if not seen before
      if (!this.hasGreeted.has(theme.id)) {
        this.addSystemMessage(`[ ${theme.personality.aiName} connected ]`);
        this.showGreeting(theme.personality);
        this.hasGreeted.add(theme.id);
      }
    });
  }

  public get messages() {
    return this.messagesSubject.value;
  }

  public async sendMessage(content: string): Promise<void> {
    const userMsg: ChatMessage = { role: 'user', content, timestamp: Date.now() };
    this.messagesSubject.next([...this.messages, userMsg]);

    // Pick a random thinking phrase from personality
    const thinkingPhrases = this.personality.thinkingPhrases;
    const phrase = thinkingPhrases[Math.floor(Math.random() * thinkingPhrases.length)];
    this.typingTextSubject.next(phrase);

    this.isTypingSubject.next(true);

    try {
      const response = await this.callOpenAiApi();
      const aiMsg: ChatMessage = { role: 'assistant', content: response, timestamp: Date.now() };
      this.messagesSubject.next([...this.messages, aiMsg]);
    } catch (error) {
      console.error('Error communicating with AI:', error);
      // Pick random themed error message
      const errorMessages = this.personality.errorMessages;
      const errorText = errorMessages[Math.floor(Math.random() * errorMessages.length)];
      const errorMsg: ChatMessage = { role: 'system', content: errorText, timestamp: Date.now() };
      this.messagesSubject.next([...this.messages, errorMsg]);
    } finally {
      this.isTypingSubject.next(false);
    }
  }

  private showGreeting(personality: ThemePersonality): void {
    const greeting: ChatMessage = {
      role: 'assistant',
      content: personality.greetingMessage,
      timestamp: Date.now()
    };
    this.messagesSubject.next([...this.messages, greeting]);
  }

  private addSystemMessage(content: string) {
    const msg: ChatMessage = { role: 'system', content, timestamp: Date.now() };
    this.messagesSubject.next([...this.messages, msg]);
  }

  private async callOpenAiApi(): Promise<string> {
    if (!this.apiKey || this.apiKey === 'YOUR_OPENAI_API_KEY') {
      // Mock response using personality-aware placeholder
      return new Promise(resolve => {
        const delay = 800 + Math.random() * 1200;
        setTimeout(() => {
          resolve(this.generateMockResponse());
        }, delay);
      });
    }

    // Build message payload with system prompt from current personality
    const systemMsg = { role: 'system' as const, content: this.personality.systemPrompt };
    const conversationMsgs = this.messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const res = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [systemMsg, ...conversationMsgs]
      })
    });

    if (!res.ok) {
      throw new Error(`API error: ${res.statusText}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;
  }

  private generateMockResponse(): string {
    // Return a random idle message from the current personality as placeholder
    const idle = this.personality.idleMessages;
    const index = Math.floor(Math.random() * idle.length);
    return `${idle[index]}\n\n[This is a placeholder response from ${this.personality.aiName}. Connect an AI backend to receive real responses.]`;
  }
}
