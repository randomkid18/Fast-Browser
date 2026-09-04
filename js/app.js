/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FAST BROWSER - APPLICATION LOGIC
 * State Management | Router | API | Storage | Features
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── CONFIGURATION ───
const CONFIG = {
  GAS_WEBAPP_URL: '', // ← PASTE YOUR GOOGLE APPS SCRIPT WEB APP URL HERE
  APP_VERSION: '1.0.0',
  MAX_HISTORY_ITEMS: 20,
  FETCH_TIMEOUT: 10000,
  STORAGE_KEYS: {
    ONBOARDING_COMPLETE: 'fb_onboarding_complete',
    SEARCH_HISTORY: 'fb_search_history',
    USERSCRIPTS: 'fb_userscripts',
    SETTINGS: 'fb_settings',
    DEVICE_ID: 'fb_device_id'
  }
};

// ─── STATE MANAGEMENT ───
const State = {
  currentView: 'home',
  previousView: null,
  searchQuery: '',
  searchEngine: 'google',
  history: [],
  userscripts: [],
  settings: {
    searchEngine: 'google',
    syncEnabled: false
  },
  deviceId: '',
  isOnline: navigator.onLine,
  apiAvailable: false,

  init() {
    this.deviceId = this.getOrCreateDeviceId();
    this.loadLocalData();
    this.checkApiAvailability();
  },

  getOrCreateDeviceId() {
    let id = localStorage.getItem(CONFIG.STORAGE_KEYS.DEVICE_ID);
    if (!id) {
      id = 'fb_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem(CONFIG.STORAGE_KEYS.DEVICE_ID, id);
    }
    return id;
  },

  loadLocalData() {
    try {
      const history = localStorage.getItem(CONFIG.STORAGE_KEYS.SEARCH_HISTORY);
      this.history = history ? JSON.parse(history) : [];
    } catch (e) {
      this.history = [];
    }

    try {
      const scripts = localStorage.getItem(CONFIG.STORAGE_KEYS.USERSCRIPTS);
      this.userscripts = scripts ? JSON.parse(scripts) : [];
    } catch (e) {
      this.userscripts = [];
    }

    try {
      const settings = localStorage.getItem(CONFIG.STORAGE_KEYS.SETTINGS);
      this.settings = settings ? JSON.parse(settings) : { searchEngine: 'google', syncEnabled: false };
    } catch (e) {
      this.settings = { searchEngine: 'google', syncEnabled: false };
    }

    this.searchEngine = this.settings.searchEngine || 'google';
  },

  saveHistory() {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEYS.SEARCH_HISTORY, JSON.stringify(this.history.slice(0, CONFIG.MAX_HISTORY_ITEMS)));
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        this.history = this.history.slice(0, 10);
        localStorage.setItem(CONFIG.STORAGE_KEYS.SEARCH_HISTORY, JSON.stringify(this.history));
        Toast.show('Storage limit reached. History trimmed.', 'warning');
      }
    }
  },

  saveUserScripts() {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEYS.USERSCRIPTS, JSON.stringify(this.userscripts));
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        Toast.show('Storage limit reached. Cannot save script.', 'error');
      }
    }
  },

  saveSettings() {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEYS.SETTINGS, JSON.stringify(this.settings));
    } catch (e) {
      // Settings are small, unlikely to exceed quota
    }
  },

  async checkApiAvailability() {
    if (!CONFIG.GAS_WEBAPP_URL) {
      this.apiAvailable = false;
      return;
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(CONFIG.GAS_WEBAPP_URL + '?action=initSheets', {
        signal: controller.signal,
        method: 'GET'
      });
      clearTimeout(timeout);
      this.apiAvailable = response.ok;
    } catch (e) {
      this.apiAvailable = false;
    }
  }
};

// ─── TOAST NOTIFICATIONS ───
const Toast = {
  container: null,

  init() {
    this.container = document.getElementById('toast-container');
  },

  show(message, type = 'info', duration = 3000) {
    if (!this.container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'status');

    this.container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-out');
      toast.addEventListener('animationend', () => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      });
    }, duration);
  }
};

// ─── API CLIENT ───
const API = {
  async fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  },

  async get(action, params = {}) {
    if (!CONFIG.GAS_WEBAPP_URL || !State.apiAvailable) return null;

    const queryParams = new URLSearchParams({ action, ...params });
    const url = `${CONFIG.GAS_WEBAPP_URL}?${queryParams.toString()}`;

    try {
      const response = await this.fetchWithTimeout(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.warn('API GET failed:', error.message);
      return null;
    }
  },

  async post(action, data = {}) {
    if (!CONFIG.GAS_WEBAPP_URL || !State.apiAvailable) return null;

    try {
      const response = await this.fetchWithTimeout(CONFIG.GAS_WEBAPP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...data })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.warn('API POST failed:', error.message);
      return null;
    }
  },

  async initSheets() {
    return this.get('initSheets');
  },

  async getSearchHistory(deviceId) {
    return this.get('getSearchHistory', { deviceId });
  },

  async saveSearch(query, engine, deviceId, timestamp) {
    return this.post('saveSearch', { query, engine, deviceId, timestamp });
  },

  async getUserScripts(deviceId) {
    return this.get('getUserScripts', { deviceId });
  },

  async saveUserScript(script, deviceId) {
    return this.post('saveUserScript', { ...script, deviceId });
  },

  async deleteUserScript(id, deviceId) {
    return this.post('deleteUserScript', { id, deviceId });
  },

  async logEvent(event, data, deviceId, timestamp) {
    return this.post('logEvent', { event, data, deviceId, timestamp });
  },

  async getSettings(deviceId) {
    return this.get('getSettings', { deviceId });
  },

  async saveSetting(key, value, deviceId) {
    return this.post('saveSetting', { key, value, deviceId });
  }
};

// ─── UTILITY FUNCTIONS ───
const Utils = {
  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  getRelativeTime(timestamp) {
    const now = new Date();
    const then = new Date(timestamp);
    const diff = Math.floor((now - then) / 1000);

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return then.toLocaleDateString();
  },

  validateScript(code) {
    // Basic bracket matching
    let brackets = 0;
    let inString = false;
    let stringChar = null;

    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      const prev = code[i - 1];

      if (inString) {
        if (char === stringChar && prev !== '\\\\') {
          inString = false;
          stringChar = null;
        }
        continue;
      }

      if (char === '"' || char === "'" || char === '`') {
        inString = true;
        stringChar = char;
        continue;
      }

      if (char === '/' && code[i + 1] === '/') {
        // Skip single-line comment
        while (i < code.length && code[i] !== '\\n') i++;
        continue;
      }

      if (char === '/' && code[i + 1] === '*') {
        // Skip multi-line comment
        i += 2;
        while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++;
        i++;
        continue;
      }

      if (char === '{') brackets++;
      if (char === '}') brackets--;
      if (brackets < 0) return { valid: false, error: 'Unmatched closing bracket' };
    }

    if (brackets !== 0) return { valid: false, error: 'Unmatched opening bracket' };

    // Check for obviously malicious patterns
    const dangerousPatterns = [
      /document\.write\s*\(/,
      /eval\s*\(/,
      /new\s+Function\s*\(/,
      /setTimeout\s*\(\s*["'`]/,
      /setInterval\s*\(\s*["'`]/,
      /<script\b/i,
      /javascript:/i
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        return { valid: false, error: 'Potentially dangerous pattern detected' };
      }
    }

    return { valid: true };
  },

  getSearchUrl(query, engine) {
    const encoded = encodeURIComponent(query);
    switch (engine) {
      case 'bing':
        return `https://www.bing.com/search?q=${encoded}`;
      case 'duckduckgo':
        return `https://duckduckgo.com/?q=${encoded}`;
      case 'google':
      default:
        return `https://www.google.com/search?q=${encoded}&sourceid=chrome-mobile&ie=UTF-8`;
    }
  }
};

// ─── VIEW MANAGER ───
const ViewManager = {
  views: {},

  init() {
    this.views = {
      onboarding: document.getElementById('view-onboarding'),
      home: document.getElementById('view-home'),
      search: document.getElementById('view-search'),
      results: document.getElementById('view-results')
    };
  },

  show(viewName, transition = true) {
    const view = this.views[viewName];
    if (!view) return;

    State.previousView = State.currentView;
    State.currentView = viewName;

    // Hide all views
    Object.values(this.views).forEach(v => {
      v.style.display = 'none';
      v.classList.remove('view-active');
      v.classList.add('view-hidden');
    });

    // Show target view
    view.style.display = 'block';
    view.classList.remove('view-hidden');
    view.classList.add('view-active');

    // Update dashboard active state
    Dashboard.updateActive(viewName);

    // Special handling
    if (viewName === 'search') {
      setTimeout(() => document.getElementById('search-input')?.focus(), 100);
    }
  }
};

// ─── ONBOARDING ───
const Onboarding = {
  currentSlide: 1,
  totalSlides: 5,
  slides: null,
  dots: null,
  touchStartX: 0,

  init() {
    const complete = localStorage.getItem(CONFIG.STORAGE_KEYS.ONBOARDING_COMPLETE);
    if (complete) {
      ViewManager.show('home');
      return;
    }

    this.slides = document.querySelectorAll('.onboarding-slide');
    this.dots = document.querySelectorAll('.onboarding-dot');

    this.showSlide(1);
    ViewManager.show('onboarding');

    // Event listeners
    document.getElementById('btn-onboarding-oke')?.addEventListener('click', () => this.complete());

    this.dots.forEach(dot => {
      dot.addEventListener('click', () => {
        const slide = parseInt(dot.dataset.slide);
        this.showSlide(slide);
      });
    });

    // Touch swipe
    const container = document.querySelector('.onboarding-slides');
    if (container) {
      container.addEventListener('touchstart', (e) => {
        this.touchStartX = e.touches[0].clientX;
      }, { passive: true });

      container.addEventListener('touchend', (e) => {
        const diff = this.touchStartX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) {
          if (diff > 0 && this.currentSlide < this.totalSlides) {
            this.showSlide(this.currentSlide + 1);
          } else if (diff < 0 && this.currentSlide > 1) {
            this.showSlide(this.currentSlide - 1);
          }
        }
      }, { passive: true });
    }
  },

  showSlide(n) {
    this.currentSlide = n;

    this.slides.forEach((slide, index) => {
      slide.classList.remove('active', 'prev');
      if (index + 1 === n) {
        slide.classList.add('active');
      } else if (index + 1 < n) {
        slide.classList.add('prev');
      }
    });

    this.dots.forEach((dot, index) => {
      dot.classList.toggle('active', index + 1 === n);
      dot.setAttribute('aria-selected', index + 1 === n ? 'true' : 'false');
    });
  },

  complete() {
    localStorage.setItem(CONFIG.STORAGE_KEYS.ONBOARDING_COMPLETE, 'true');
    const view = document.getElementById('view-onboarding');
    if (view) {
      view.style.transition = 'opacity 400ms ease-out';
      view.style.opacity = '0';
      setTimeout(() => {
        ViewManager.show('home');
      }, 400);
    }
  },

  reset() {
    localStorage.removeItem(CONFIG.STORAGE_KEYS.ONBOARDING_COMPLETE);
    this.currentSlide = 1;
    this.init();
  }
};

// ─── SEARCH ───
const Search = {
  input: null,
  clearBtn: null,
  engineSelect: null,
  historyList: null,
  historyEmpty: null,

  init() {
    this.input = document.getElementById('search-input');
    this.clearBtn = document.getElementById('btn-search-clear');
    this.engineSelect = document.getElementById('search-engine-select');
    this.historyList = document.getElementById('search-history-list');
    this.historyEmpty = document.getElementById('search-history-empty');

    // Set initial engine
    if (this.engineSelect) {
      this.engineSelect.value = State.searchEngine;
    }

    // Event listeners
    document.getElementById('home-search-bar')?.addEventListener('click', () => {
      ViewManager.show('search');
    });

    document.getElementById('home-search-bar')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        ViewManager.show('search');
      }
    });

    document.getElementById('btn-search-close')?.addEventListener('click', () => {
      if (State.previousView === 'results') {
        ViewManager.show('results');
      } else {
        ViewManager.show('home');
      }
    });

    this.input?.addEventListener('input', () => this.handleInput());
    this.input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.executeSearch();
    });

    this.clearBtn?.addEventListener('click', () => {
      this.input.value = '';
      this.handleInput();
      this.input.focus();
    });

    document.getElementById('btn-search-submit')?.addEventListener('click', () => this.executeSearch());

    this.engineSelect?.addEventListener('change', (e) => {
      State.searchEngine = e.target.value;
      State.settings.searchEngine = e.target.value;
      State.saveSettings();
    });

    document.getElementById('btn-clear-all-history')?.addEventListener('click', () => {
      ConfirmDialog.show('Clear all search history?', () => {
        State.history = [];
        State.saveHistory();
        this.renderHistory();
        Toast.show('Search history cleared', 'success');
      });
    });

    document.getElementById('results-search-bar')?.addEventListener('click', () => {
      ViewManager.show('search');
    });

    this.renderHistory();
  },

  handleInput() {
    const hasValue = this.input.value.length > 0;
    this.clearBtn.style.display = hasValue ? 'flex' : 'none';
  },

  executeSearch() {
    const query = this.input.value.trim();
    if (!query) {
      Toast.show('Please enter a search query', 'warning');
      return;
    }

    State.searchQuery = query;
    this.addToHistory(query);

    // Update results view
    const resultsQueryText = document.getElementById('results-query-text');
    if (resultsQueryText) {
      resultsQueryText.textContent = query;
    }

    const iframe = document.getElementById('results-iframe');
    const loader = document.getElementById('iframe-loader');
    if (iframe) {
      loader.style.display = 'flex';
      iframe.src = Utils.getSearchUrl(query, State.searchEngine);
      iframe.onload = () => {
        loader.style.display = 'none';
        this.injectUserScripts();
      };
    }

    this.input.value = '';
    this.handleInput();
    ViewManager.show('results');

    // Log event
    if (State.settings.syncEnabled) {
      API.logEvent('search', { query, engine: State.searchEngine }, State.deviceId, new Date().toISOString());
    }
  },

  addToHistory(query) {
    const existingIndex = State.history.findIndex(h => h.query.toLowerCase() === query.toLowerCase());
    if (existingIndex !== -1) {
      State.history.splice(existingIndex, 1);
    }

    State.history.unshift({
      query,
      engine: State.searchEngine,
      timestamp: new Date().toISOString()
    });

    State.saveHistory();
    this.renderHistory();

    // Sync to spreadsheet
    if (State.settings.syncEnabled && State.apiAvailable) {
      API.saveSearch(query, State.searchEngine, State.deviceId, new Date().toISOString());
    }
  },

  deleteHistoryItem(index) {
    State.history.splice(index, 1);
    State.saveHistory();
    this.renderHistory();
  },

  renderHistory() {
    if (!this.historyList) return;

    if (State.history.length === 0) {
      this.historyList.style.display = 'none';
      this.historyEmpty.style.display = 'flex';
      return;
    }

    this.historyList.style.display = 'flex';
    this.historyEmpty.style.display = 'none';

    this.historyList.innerHTML = State.history.slice(0, CONFIG.MAX_HISTORY_ITEMS).map((item, index) => `
      <div class="search-history-item" role="listitem" data-index="${index}">
        <svg class="history-item-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
        </svg>
        <div class="history-item-content">
          <div class="history-item-query">${Utils.escapeHtml(item.query)}</div>
          <div class="history-item-time">${Utils.getRelativeTime(item.timestamp)}</div>
        </div>
        <button class="history-item-delete" data-index="${index}" aria-label="Delete ${Utils.escapeHtml(item.query)}">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    `).join('');

    // Add click handlers
    this.historyList.querySelectorAll('.search-history-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.history-item-delete')) return;
        const index = parseInt(item.dataset.index);
        const historyItem = State.history[index];
        if (historyItem) {
          this.input.value = historyItem.query;
          this.handleInput();
          State.searchEngine = historyItem.engine || 'google';
          if (this.engineSelect) this.engineSelect.value = State.searchEngine;
        }
      });
    });

    this.historyList.querySelectorAll('.history-item-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        this.deleteHistoryItem(index);
      });
    });
  },

  injectUserScripts() {
    const iframe = document.getElementById('results-iframe');
    if (!iframe || !iframe.contentWindow) return;

    const enabledScripts = State.userscripts.filter(s => s.enabled);
    if (enabledScripts.length === 0) return;

    const scriptsToInject = enabledScripts.map(s => {
      return `
        try {
          ${s.code}
        } catch (e) {
          console.error('[FastBrowser UserScript "${s.name.replace(/"/g, '\\"')}"]:', e);
        }
      `;
    }).join('\\n');

    // Try postMessage injection (best effort for cross-origin)
    try {
      iframe.contentWindow.postMessage({
        type: 'fastbrowser-userscript',
        scripts: scriptsToInject
      }, '*');
    } catch (e) {
      console.warn('UserScript injection failed:', e);
    }
  }
};

// ─── USERSCRIPTS MANAGER ───
const UserScripts = {
  modal: null,
  formModal: null,
  list: null,
  empty: null,
  form: null,
  editingId: null,

  init() {
    this.modal = document.getElementById('modal-userscripts');
    this.formModal = document.getElementById('modal-userscript-form');
    this.list = document.getElementById('userscripts-list');
    this.empty = document.getElementById('userscripts-empty');
    this.form = document.getElementById('userscript-form');

    // Open modal
    document.querySelector('[data-view="userscripts"]')?.addEventListener('click', () => {
      this.openModal();
    });

    // Close modal
    document.getElementById('btn-close-userscripts')?.addEventListener('click', () => {
      this.closeModal();
    });

    // Add new
    document.getElementById('btn-add-userscript')?.addEventListener('click', () => {
      this.openForm();
    });

    // Close form
    document.getElementById('btn-close-userscript-form')?.addEventListener('click', () => {
      this.closeForm();
    });

    document.getElementById('btn-userscript-cancel')?.addEventListener('click', () => {
      this.closeForm();
    });

    // Form submit
    this.form?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveScript();
    });

    // Close on backdrop click
    this.modal?.querySelector('.modal-backdrop')?.addEventListener('click', () => {
      this.closeModal();
    });

    this.formModal?.querySelector('.modal-backdrop')?.addEventListener('click', () => {
      this.closeForm();
    });

    this.renderList();
  },

  openModal() {
    if (!this.modal) return;
    this.modal.style.display = 'flex';
    this.renderList();
    document.body.style.overflow = 'hidden';
  },

  closeModal() {
    if (!this.modal) return;
    this.modal.style.display = 'none';
    document.body.style.overflow = '';
  },

  openForm(script = null) {
    if (!this.formModal) return;

    this.editingId = script ? script.id : null;
    document.getElementById('userscript-form-title').textContent = script ? 'Edit Script' : 'Add Script';
    document.getElementById('userscript-id').value = script ? script.id : '';
    document.getElementById('userscript-name').value = script ? script.name : '';
    document.getElementById('userscript-code').value = script ? script.code : '';
    document.getElementById('userscript-enabled').checked = script ? script.enabled : true;

    this.formModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    setTimeout(() => document.getElementById('userscript-name')?.focus(), 100);
  },

  closeForm() {
    if (!this.formModal) return;
    this.formModal.style.display = 'none';
    this.editingId = null;
    this.form.reset();
    document.body.style.overflow = '';
  },

  saveScript() {
    const name = document.getElementById('userscript-name').value.trim();
    const code = document.getElementById('userscript-code').value.trim();
    const enabled = document.getElementById('userscript-enabled').checked;

    if (!name) {
      Toast.show('Script name is required', 'error');
      return;
    }

    if (!code) {
      Toast.show('Script code is required', 'error');
      return;
    }

    // Validate syntax
    const validation = Utils.validateScript(code);
    if (!validation.valid) {
      Toast.show('Script validation: ' + validation.error, 'error');
      return;
    }

    const now = new Date().toISOString();

    if (this.editingId) {
      const index = State.userscripts.findIndex(s => s.id === this.editingId);
      if (index !== -1) {
        State.userscripts[index] = {
          ...State.userscripts[index],
          name,
          code,
          enabled,
          updatedAt: now
        };
      }
    } else {
      State.userscripts.unshift({
        id: Utils.generateUUID(),
        name,
        code,
        enabled,
        createdAt: now,
        updatedAt: now
      });
    }

    State.saveUserScripts();
    this.renderList();
    this.closeForm();
    Toast.show(this.editingId ? 'Script updated' : 'Script saved', 'success');

    // Sync to spreadsheet
    if (State.settings.syncEnabled && State.apiAvailable) {
      const script = State.userscripts.find(s => s.id === (this.editingId || State.userscripts[0].id));
      if (script) {
        API.saveUserScript(script, State.deviceId);
      }
    }
  },

  deleteScript(id) {
    ConfirmDialog.show('Delete this script?', () => {
      State.userscripts = State.userscripts.filter(s => s.id !== id);
      State.saveUserScripts();
      this.renderList();
      Toast.show('Script deleted', 'success');

      if (State.settings.syncEnabled && State.apiAvailable) {
        API.deleteUserScript(id, State.deviceId);
      }
    });
  },

  toggleScript(id) {
    const script = State.userscripts.find(s => s.id === id);
    if (script) {
      script.enabled = !script.enabled;
      script.updatedAt = new Date().toISOString();
      State.saveUserScripts();
      this.renderList();

      if (State.settings.syncEnabled && State.apiAvailable) {
        API.saveUserScript(script, State.deviceId);
      }
    }
  },

  renderList() {
    if (!this.list) return;

    if (State.userscripts.length === 0) {
      this.list.style.display = 'none';
      this.empty.style.display = 'flex';
      return;
    }

    this.list.style.display = 'flex';
    this.empty.style.display = 'none';

    this.list.innerHTML = State.userscripts.map(script => `
      <div class="userscript-card">
        <div class="userscript-card-header">
          <span class="userscript-card-name">${Utils.escapeHtml(script.name)}</span>
          <label class="toggle-switch">
            <input type="checkbox" ${script.enabled ? 'checked' : ''} data-id="${script.id}" class="script-toggle">
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="userscript-card-preview">${Utils.escapeHtml(script.code.substring(0, 60))}${script.code.length > 60 ? '...' : ''}</div>
        <div class="userscript-card-actions">
          <button class="icon-btn btn-edit-script" data-id="${script.id}" aria-label="Edit ${Utils.escapeHtml(script.name)}">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="icon-btn btn-delete-script" data-id="${script.id}" aria-label="Delete ${Utils.escapeHtml(script.name)}">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    `).join('');

    // Event listeners
    this.list.querySelectorAll('.script-toggle').forEach(toggle => {
      toggle.addEventListener('change', (e) => {
        this.toggleScript(e.target.dataset.id);
      });
    });

    this.list.querySelectorAll('.btn-edit-script').forEach(btn => {
      btn.addEventListener('click', () => {
        const script = State.userscripts.find(s => s.id === btn.dataset.id);
        if (script) this.openForm(script);
      });
    });

    this.list.querySelectorAll('.btn-delete-script').forEach(btn => {
      btn.addEventListener('click', () => {
        this.deleteScript(btn.dataset.id);
      });
    });
  }
};

// ─── SETTINGS MANAGER ───
const Settings = {
  modal: null,

  init() {
    this.modal = document.getElementById('modal-settings');

    // Open modal
    document.querySelector('[data-view="settings"]')?.addEventListener('click', () => {
      this.openModal();
    });

    // Close modal
    document.getElementById('btn-close-settings')?.addEventListener('click', () => {
      this.closeModal();
    });

    this.modal?.querySelector('.modal-backdrop')?.addEventListener('click', () => {
      this.closeModal();
    });

    // Settings controls
    const searchEngineSelect = document.getElementById('setting-search-engine');
    if (searchEngineSelect) {
      searchEngineSelect.value = State.settings.searchEngine || 'google';
      searchEngineSelect.addEventListener('change', (e) => {
        State.settings.searchEngine = e.target.value;
        State.searchEngine = e.target.value;
        State.saveSettings();
        Toast.show('Default search engine updated', 'success');
      });
    }

    const syncToggle = document.getElementById('setting-sync-enabled');
    if (syncToggle) {
      syncToggle.checked = State.settings.syncEnabled || false;
      syncToggle.addEventListener('change', (e) => {
        State.settings.syncEnabled = e.target.checked;
        State.saveSettings();
        if (e.target.checked) {
          Toast.show('Sync enabled. Data will backup to spreadsheet.', 'success');
          this.syncAllData();
        } else {
          Toast.show('Sync disabled.', 'info');
        }
      });
    }

    // Clear history
    document.getElementById('btn-clear-history')?.addEventListener('click', () => {
      ConfirmDialog.show('Clear all search history?', () => {
        State.history = [];
        State.saveHistory();
        Search.renderHistory();
        Toast.show('Search history cleared', 'success');
      });
    });

    // Reset onboarding
    document.getElementById('btn-reset-onboarding')?.addEventListener('click', () => {
      ConfirmDialog.show('Show onboarding again?', () => {
        Onboarding.reset();
        this.closeModal();
      });
    });

    // Device ID
    const deviceIdEl = document.getElementById('settings-device-id');
    if (deviceIdEl) {
      deviceIdEl.textContent = State.deviceId;
    }
  },

  openModal() {
    if (!this.modal) return;
    this.modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  },

  closeModal() {
    if (!this.modal) return;
    this.modal.style.display = 'none';
    document.body.style.overflow = '';
  },

  async syncAllData() {
    if (!State.apiAvailable) {
      Toast.show('API not available. Check your Web App URL.', 'warning');
      return;
    }

    // Sync search history
    for (const item of State.history.slice(0, 10)) {
      await API.saveSearch(item.query, item.engine, State.deviceId, item.timestamp);
    }

    // Sync userscripts
    for (const script of State.userscripts) {
      await API.saveUserScript(script, State.deviceId);
    }

    // Sync settings
    await API.saveSetting('searchEngine', State.settings.searchEngine, State.deviceId);
    await API.saveSetting('syncEnabled', String(State.settings.syncEnabled), State.deviceId);

    Toast.show('Sync complete', 'success');
  }
};

// ─── DASHBOARD ───
const Dashboard = {
  init() {
    const items = document.querySelectorAll('.dashboard-item');
    items.forEach(item => {
      item.addEventListener('click', () => {
        const view = item.dataset.view;
        if (view === 'home') {
          // Clear iframe if coming from results
          if (State.currentView === 'results') {
            const iframe = document.getElementById('results-iframe');
            if (iframe) iframe.src = 'about:blank';
          }
          ViewManager.show('home');
        }
        // userscripts and settings are handled by their respective modules
      });
    });
  },

  updateActive(viewName) {
    const items = document.querySelectorAll('.dashboard-item');
    items.forEach(item => {
      const itemView = item.dataset.view;
      const isActive = (viewName === 'home' && itemView === 'home') ||
                       (viewName === 'results' && itemView === 'home');
      item.classList.toggle('active', isActive);
    });
  }
};

// ─── CONFIRM DIALOG ───
const ConfirmDialog = {
  modal: null,
  onConfirm: null,

  init() {
    this.modal = document.getElementById('modal-confirm');

    document.getElementById('btn-confirm-cancel')?.addEventListener('click', () => {
      this.close();
    });

    document.getElementById('btn-confirm-ok')?.addEventListener('click', () => {
      if (this.onConfirm) this.onConfirm();
      this.close();
    });

    this.modal?.querySelector('.modal-backdrop')?.addEventListener('click', () => {
      this.close();
    });
  },

  show(message, onConfirm) {
    if (!this.modal) return;
    this.onConfirm = onConfirm;
    document.getElementById('confirm-message').textContent = message;
    this.modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  },

  close() {
    if (!this.modal) return;
    this.modal.style.display = 'none';
    this.onConfirm = null;
    document.body.style.overflow = '';
  }
};

// ─── KEYBOARD NAVIGATION ───
const KeyboardNav = {
  init() {
    document.addEventListener('keydown', (e) => {
      // Escape closes modals
      if (e.key === 'Escape') {
        const openModals = document.querySelectorAll('.modal[style*="flex"]');
        if (openModals.length > 0) {
          const lastModal = openModals[openModals.length - 1];
          if (lastModal.id === 'modal-userscripts') UserScripts.closeModal();
          else if (lastModal.id === 'modal-userscript-form') UserScripts.closeForm();
          else if (lastModal.id === 'modal-settings') Settings.closeModal();
          else if (lastModal.id === 'modal-confirm') ConfirmDialog.close();
        } else if (State.currentView === 'search') {
          ViewManager.show(State.previousView || 'home');
        }
      }
    });
  }
};

// ─── NETWORK STATUS ───
const NetworkStatus = {
  init() {
    window.addEventListener('online', () => {
      State.isOnline = true;
      Toast.show('You are back online', 'success');
      State.checkApiAvailability();
    });

    window.addEventListener('offline', () => {
      State.isOnline = false;
      Toast.show('You are offline. Using local storage.', 'warning');
    });
  }
};

// ─── SERVICE WORKER (PWA Placeholder) ───
const ServiceWorker = {
  init() {
    if ('serviceWorker' in navigator) {
      // Placeholder: In production, register a real service worker
      // navigator.serviceWorker.register('/sw.js').catch(console.error);
    }
  }
};

// ─── MESSAGE LISTENER (for iframe userscripts) ───
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'fastbrowser-userscript-ack') {
    console.log('UserScript acknowledged by iframe');
  }
});

// ─── INITIALIZATION ───
document.addEventListener('DOMContentLoaded', () => {
  Toast.init();
  State.init();
  ViewManager.init();
  Onboarding.init();
  Search.init();
  UserScripts.init();
  Settings.init();
  Dashboard.init();
  ConfirmDialog.init();
  KeyboardNav.init();
  NetworkStatus.init();
  ServiceWorker.init();

  console.log('\\u2554═══════════════════════════════════════════════════════════════╗');
  console.log('║                    FAST BROWSER v1.0.0                         ║');
  console.log('║           Lightweight. Private. Yours.                         ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('Device ID:', State.deviceId);
  console.log('API Available:', State.apiAvailable);
  console.log('Sync Enabled:', State.settings.syncEnabled);
});
