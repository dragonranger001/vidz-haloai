import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiSettingsService, ApiEndpoint } from '../../services/api-settings.service';

@Component({
  selector: 'app-api-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './api-settings.component.html',
  styleUrls: ['./api-settings.component.css']
})
export class ApiSettingsComponent implements OnInit {
  isOpen = false;
  endpoints: ApiEndpoint[] = [];
  activeEndpointId = '';
  editingEndpoint: ApiEndpoint | null = null;
  connectionStatus: { [id: string]: 'untested' | 'testing' | 'success' | 'fail' } = {};

  constructor(private apiSettings: ApiSettingsService) {}

  ngOnInit() {
    this.apiSettings.endpoints$.subscribe(e => this.endpoints = e);
    this.apiSettings.activeEndpoint$.subscribe(a => this.activeEndpointId = a.id);

    // Listen for toggle event from other components (like hud-header)
    document.addEventListener('toggle-api-settings', () => {
      this.togglePanel();
    });
  }

  togglePanel() {
    this.isOpen = !this.isOpen;
    if (!this.isOpen) {
      this.editingEndpoint = null;
    }
  }

  selectEndpoint(id: string) {
    this.apiSettings.setActiveEndpoint(id);
  }

  editEndpoint(endpoint: ApiEndpoint) {
    this.editingEndpoint = { ...endpoint }; // clone for editing
  }

  addNewEndpoint() {
    this.editingEndpoint = {
      id: 'custom-' + Date.now(),
      name: 'New Custom Endpoint',
      url: 'http://localhost:1234/v1/chat/completions',
      apiKey: ''
    };
  }

  saveEndpoint() {
    if (this.editingEndpoint) {
      const exists = this.endpoints.some(e => e.id === this.editingEndpoint!.id);
      if (exists) {
        this.apiSettings.updateEndpoint(this.editingEndpoint);
      } else {
        this.apiSettings.addEndpoint(this.editingEndpoint);
      }
      this.editingEndpoint = null;
    }
  }

  cancelEdit() {
    this.editingEndpoint = null;
  }

  deleteEndpoint(id: string) {
    this.apiSettings.deleteEndpoint(id);
    if (this.editingEndpoint?.id === id) {
      this.editingEndpoint = null;
    }
  }

  async testConnection(endpoint: ApiEndpoint) {
    this.connectionStatus[endpoint.id] = 'testing';
    const success = await this.apiSettings.testConnection(endpoint);
    this.connectionStatus[endpoint.id] = success ? 'success' : 'fail';
    
    // Clear status after 3 seconds
    setTimeout(() => {
      if (this.connectionStatus[endpoint.id] === 'success' || this.connectionStatus[endpoint.id] === 'fail') {
        this.connectionStatus[endpoint.id] = 'untested';
      }
    }, 3000);
  }
}
