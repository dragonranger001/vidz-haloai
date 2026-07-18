import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ApiEndpoint {
  id: string;
  name: string;
  url: string;
  apiKey: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApiSettingsService {
  private readonly STORAGE_KEY = 'halo_ai_endpoints';
  private readonly ACTIVE_KEY = 'halo_ai_active_endpoint';

  private defaultEndpoints: ApiEndpoint[] = [
    {
      id: 'default-openai',
      name: 'OpenAI Default',
      url: 'https://api.openai.com/v1/chat/completions',
      apiKey: '' // Provide real key or prompt user
    }
  ];

  private endpointsSubject = new BehaviorSubject<ApiEndpoint[]>(this.defaultEndpoints);
  public endpoints$ = this.endpointsSubject.asObservable();

  private activeEndpointSubject = new BehaviorSubject<ApiEndpoint>(this.defaultEndpoints[0]);
  public activeEndpoint$ = this.activeEndpointSubject.asObservable();

  private connectedStatusSubject = new BehaviorSubject<boolean>(false);
  public connectedStatus$ = this.connectedStatusSubject.asObservable();

  constructor() {
    this.loadSettings();
  }

  private loadSettings() {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.endpointsSubject.next(parsed);
        }
      } catch (e) {
        console.error('Failed to parse saved endpoints', e);
      }
    }

    const activeId = localStorage.getItem(this.ACTIVE_KEY);
    const endpoints = this.endpointsSubject.value;
    if (activeId) {
      const active = endpoints.find(e => e.id === activeId);
      if (active) {
        this.activeEndpointSubject.next(active);
      }
    } else {
      this.activeEndpointSubject.next(endpoints[0]);
    }
  }

  private saveSettings() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.endpointsSubject.value));
    localStorage.setItem(this.ACTIVE_KEY, this.activeEndpointSubject.value.id);
  }

  public get activeEndpoint(): ApiEndpoint {
    return this.activeEndpointSubject.value;
  }

  public get endpoints(): ApiEndpoint[] {
    return this.endpointsSubject.value;
  }

  public addEndpoint(endpoint: ApiEndpoint) {
    const current = this.endpointsSubject.value;
    this.endpointsSubject.next([...current, endpoint]);
    this.saveSettings();
  }

  public updateEndpoint(updated: ApiEndpoint) {
    const current = this.endpointsSubject.value.map(e => e.id === updated.id ? updated : e);
    this.endpointsSubject.next(current);
    if (this.activeEndpointSubject.value.id === updated.id) {
      this.activeEndpointSubject.next(updated);
    }
    this.saveSettings();
  }

  public deleteEndpoint(id: string) {
    const current = this.endpointsSubject.value.filter(e => e.id !== id);
    this.endpointsSubject.next(current);
    
    // If we delete active, switch to first available or create a new empty one
    if (this.activeEndpointSubject.value.id === id) {
      if (current.length > 0) {
        this.setActiveEndpoint(current[0].id);
      } else {
        const fallback: ApiEndpoint = { id: 'custom-' + Date.now(), name: 'Custom Endpoint', url: '', apiKey: '' };
        this.addEndpoint(fallback);
        this.setActiveEndpoint(fallback.id);
      }
    }
    this.saveSettings();
  }

  public setActiveEndpoint(id: string) {
    const endpoint = this.endpointsSubject.value.find(e => e.id === id);
    if (endpoint) {
      this.activeEndpointSubject.next(endpoint);
      this.saveSettings();
      // Re-test connection when switching
      this.testConnection(endpoint);
    }
  }

  public setConnectedStatus(status: boolean) {
    this.connectedStatusSubject.next(status);
  }

  public async testConnection(endpoint: ApiEndpoint): Promise<boolean> {
    try {
      // Basic ping test. For OpenAI API we might just check if models endpoint works or send a very simple prompt.
      // Since models endpoint is safe:
      let url = endpoint.url;
      if (url.includes('/chat/completions')) {
        url = url.replace('/chat/completions', '/models');
      }

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${endpoint.apiKey}`
        }
      });
      
      const success = res.ok;
      if (this.activeEndpointSubject.value.id === endpoint.id) {
        this.setConnectedStatus(success);
      }
      return success;
    } catch (e) {
      if (this.activeEndpointSubject.value.id === endpoint.id) {
        this.setConnectedStatus(false);
      }
      return false;
    }
  }
}
