class Content {
    constructor() {
        this.suggestionBox = null;
        this.currentInput = null;
        this.debounceTimer = null;
        this.isEnabled = true;
        this.attachedElements = new Set();
        this.settings = null;
        this.initialize();
    }
    
    async initialize() {
        console.log('Content DOM loaded');
        try {
            // check server status via background script
            const status = await sendApiMessage({ action: "checkServerStatus" });
            console.log('Server status:', status);
            
            if (!status.online) {
                updateConnectionStatus(false, status.error);
                return;
            }
            
            updateConnectionStatus(true);
            
            await this.loadSettings();
            await this.createSuggestionBox();
            await this.attachToExistingInputs();
            await this.observeTextInputs();
            this.setupMessageListener();
            console.log('Content script initialized');
            
        } catch (error) {
            console.error('Error initializing content:', error);
            updateConnectionStatus(false, error.message);
        }
    }

    async loadSettings() {
        try {
            const settings = await sendApiMessage({ action: 'getSettings' });
            console.log('Raw API response for settings:', settings);
            
            if (settings && typeof settings === 'object') {
                this.settings = settings;
            } else if (settings && settings.data) {
                this.settings = settings.data;
            } else {
                this.settings = {
                    extension_enabled: true,
                    active_model: 'all',
                    post_box: true,
                    search_bar: true,
                    comment_box: true,
                    chat_box: true,
                    prediction_method: 'backoff',
                    suggestions_count: 3
                };
                console.log('Using fallback default settings due to unexpected API response structure');
            }
            
            console.log('Content script loaded settings:', this.settings);
            console.log('Settings type:', typeof this.settings);
            console.log('Settings keys:', Object.keys(this.settings || {}));
        } catch (error) {
            console.error('Error loading settings in content script:', error);
            this.settings = {
                extension_enabled: true,
                active_model: 'all',
                post_box: true,
                search_bar: true,
                comment_box: true,
                chat_box: true,
                prediction_method: 'backoff',
                suggestions_count: 3
            };
            console.log('Content script using default settings:', this.settings);
        }
    }

    async createSuggestionBox() {
        this.suggestionBox = document.createElement('div');
        this.suggestionBox.id = 'ngram-suggestions';
        this.suggestionBox.className = 'ngram-suggestion-box';
        this.suggestionBox.style.cssText = `
            position: absolute;
            z-index: 10000;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            max-width: 300px;
            display: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            color: black
        `;
        document.body.appendChild(this.suggestionBox);
    }

    async observeTextInputs() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        this.findAndAttachInputs(node);
                    }
                });
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    async findAndAttachInputs(container) {
        // Find all possible text input elements
        const selectors = [
            'input[type="text"]',
            // 'input[type="email"]', 
            'input[type="search"]',
            'textarea',
            '[role="textbox"]',
            '[contenteditable="true"]',
            '.notranslate', // Common class for editable areas
            '[data-text="true"]' // Some sites use this
        ];
        
        selectors.forEach(selector => {
            const elements = container.querySelectorAll ? 
                container.querySelectorAll(selector) : 
                (container.matches && container.matches(selector) ? [container] : []);
            
            elements.forEach(element => this.attachToInput(element));
        });
    }

    async attachToExistingInputs() {
        this.findAndAttachInputs(document);
    }

        shouldEnableForElement(element) {
        if (!this.settings) return true;
        
        const elementType = this.getElementType(element);
        
        switch (elementType) {
            case 'search':
                return this.settings.search_bar;
            case 'post':
                return this.settings.post_box;
            case 'comment':
                return this.settings.comment_box;
            case 'chat':
                return this.settings.chat_box;
            default:
                return true; // enable for unknown types
        }
    }

    getElementType(element) {
        const id = (element.id || '').toLowerCase();
        const className = (element.className || '').toLowerCase();
        const name = (element.name || '').toLowerCase();
        const placeholder = (element.placeholder || '').toLowerCase();
        const ariaLabel = (element.getAttribute('aria-label') || '').toLowerCase();
        const role = (element.getAttribute('role') || '').toLowerCase();
        
        const searchIndicators = ['search', 'query', 'find', 'lookup'];
        if (searchIndicators.some(indicator => 
            id.includes(indicator) || className.includes(indicator) || 
            name.includes(indicator) || placeholder.includes(indicator) || 
            ariaLabel.includes(indicator)
        )) {
            return 'search';
        }
        
        const chatIndicators = ['chat', 'message', 'msg', 'conversation', 'talk', 'reply'];
        if (chatIndicators.some(indicator => 
            id.includes(indicator) || className.includes(indicator) || 
            name.includes(indicator) || placeholder.includes(indicator) || 
            ariaLabel.includes(indicator)
        )) {
            return 'chat';
        }
        
        const commentIndicators = ['comment', 'feedback', 'review', 'note'];
        if (commentIndicators.some(indicator => 
            id.includes(indicator) || className.includes(indicator) || 
            name.includes(indicator) || placeholder.includes(indicator) || 
            ariaLabel.includes(indicator)
        )) {
            return 'comment';
        }
        
        const postIndicators = ['post', 'status', 'update', 'tweet', 'share', 'compose'];
        if (postIndicators.some(indicator => 
            id.includes(indicator) || className.includes(indicator) || 
            name.includes(indicator) || placeholder.includes(indicator) || 
            ariaLabel.includes(indicator)
        )) {
            return 'post';
        }
        
        if (element.tagName === 'TEXTAREA') {
            const rect = element.getBoundingClientRect();
            return rect.height > 100 ? 'post' : 'comment';
        }
        
        return 'post'; // Default fallback
    }

    attachToInput(element) {
        // Skip if already attached
        if (this.attachedElements.has(element)) {
            return;
        }
        
        // Skip password fields and other sensitive inputs
        if (this.shouldSkipElement(element)) {
            return;
        }
        
        this.attachedElements.add(element);
        
        element.addEventListener('input', (e) => this.handleInput(e));
        element.addEventListener('keydown', (e) => this.handleKeydown(e));
        element.addEventListener('blur', () => this.hideSuggestions());
        element.addEventListener('focus', (e) => this.handleFocus(e));
        
        console.log('Attached N-gram assistant to:', element.tagName, element.className);
    }

    shouldSkipElement(element) {
        const skipTypes = ['password', 'hidden', 'submit', 'button', 'reset', 'file'];
        const skipClasses = ['captcha', 'verification', 'otp', 'pin'];
        const skipIds = ['password', 'pwd', 'pin', 'otp', 'captcha'];
        
        // Skip based on input type
        if (element.type && skipTypes.includes(element.type.toLowerCase())) {
            return true;
        }
        
        // Skip based on class
        if (element.classList && [...element.classList].some(cls => skipClasses.includes(cls))) {
            return true;
        }
    
        // Skip based on id
        if (element.id && skipIds.includes(element.id.toLowerCase())) {
            return true;
        }
        
        // Skip based on attributes that suggest sensitive data
        const id = (element.id || '').toLowerCase();
        const className = (element.className || '').toLowerCase();
        const name = (element.name || '').toLowerCase();
        const placeholder = (element.placeholder || '').toLowerCase();
        
        // Check for password-related attributes
        if (id.includes('password') || id.includes('pwd') || id.includes('pin') || 
            className.includes('password') || className.includes('pwd') || 
            name.includes('password') || name.includes('pwd') || 
            placeholder.includes('password') || placeholder.includes('pwd')) {
            return true;
        }
        
        const rect = element.getBoundingClientRect();
        if (rect.width < 100 || rect.height < 20) {
            return true;
        }
        
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return true;
        }
        
        return false;
    }

    handleInput(event) {
        if (!this.isEnabled) return;

        if (!this.shouldEnableForElement(event.target)) {
            this.hideSuggestions();
            return;
        }
        
        this.currentInput = event.target;
        
        // Clear previous timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        // Debounce to avoid too many predictions
        this.debounceTimer = setTimeout(() => {
            this.showSuggestions(event.target);
        }, 900);
    }
    
    handleKeydown(event) {
        if (!this.suggestionBox || this.suggestionBox.style.display === 'none') {
            return;
        }
        
        const suggestions = this.suggestionBox.querySelectorAll('.suggestion-item');
        const selected = this.suggestionBox.querySelector('.suggestion-item.selected');
        
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.selectNextSuggestion(suggestions);
                break;
            case 'ArrowUp':
                event.preventDefault();
                this.selectPrevSuggestion(suggestions);
                break;
            case 'Tab':
            case 'Enter':
                if (selected) {
                    event.preventDefault();
                    this.applySuggestion(selected.textContent, event.target);
                }
                break;
            case 'Escape':
                this.hideSuggestions();
                break;
        }
    }
    
    handleFocus(event) {
        this.currentInput = event.target;
    }
    
    async showSuggestions(element) {
        if (!this.shouldEnableForElement(element)) {
            this.hideSuggestions();
            return;
        }

        const text = this.getElementText(element);
        
        if (text.length < 2) {
            this.hideSuggestions();
            return;
        }
        
        // Get the last few words for context
        const words = text.trim().split(/\s+/);
        if (words.length < 1) {
            this.hideSuggestions();
            return;
        }
        
        const context = words.slice(-10).join(' '); // Use last 10 words for context
        
        try {
            const method = (this.settings && this.settings.prediction_method) || "backoff";
            const topK = (this.settings && this.settings.suggestions_count) || 3;

            // Log current settings being used for prediction
            console.log('Making prediction with settings:', {
                method: method,
                suggestions_count: topK,
                active_model: this.settings?.active_model || 'unknown',
                context_length: context.length,
                context_preview: context.substring(0, 50) + (context.length > 50 ? '...' : '')
            });
            
            // Debug logging for settings object
            console.log('Full settings object:', this.settings);
            console.log('Settings active_model property:', this.settings?.active_model);
            console.log('Settings keys available:', Object.keys(this.settings || {}));

            const result = await sendApiMessage({
                action: "predict",
                text: context,
                topK,
                method
            });
            const suggestions = result.predictions || [];
            
            if (suggestions.length === 0) {
                this.hideSuggestions();
                return;
            }
            
            // Update suggestion box
            this.updateSuggestionBox(suggestions, element);
        } catch (error) {
            console.error('Error getting suggestions:', error);
            this.hideSuggestions();
        }
    }
    
    getElementText(element) {
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            return element.value || '';
        } else {
            return element.textContent || element.innerText || '';
        }
    }
    
    updateSuggestionBox(suggestions, element) {
        // Clear previous suggestions
        this.suggestionBox.innerHTML = '';
        
        // Add header
        const header = document.createElement('div');
        header.className = 'suggestion-header';
        header.style.cssText = `
            padding: 8px 12px;
            background: #f5f5f5;
            border-bottom: 1px solid #ddd;
            font-weight: 600;
            font-size: 12px;
            color: #666;
        `;
        header.textContent = 'Suggested words:';
        this.suggestionBox.appendChild(header);
        
        // Add suggestions
        suggestions.forEach((suggestion, index) => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.style.cssText = `
                padding: 8px 12px;
                cursor: pointer;
                border-bottom: 1px solid #eee;
                transition: background-color 0.2s;
            `;
            
            if (index === 0) {
                item.classList.add('selected');
                item.style.backgroundColor = '#e3f2fd';
            }
            
            item.textContent = suggestion;
            
            item.addEventListener('mouseenter', () => {
                this.suggestionBox.querySelectorAll('.suggestion-item').forEach(s => {
                    s.classList.remove('selected');
                    s.style.backgroundColor = '';
                });
                item.classList.add('selected');
                item.style.backgroundColor = '#e3f2fd';
            });
            
            item.addEventListener('click', () => {
                this.applySuggestion(suggestion, element);
            });
            
            this.suggestionBox.appendChild(item);
        });
        
        // Position the suggestion box
        this.positionSuggestionBox(element);
            
        // Show the box
        this.suggestionBox.style.display = 'block';
    }
    
    positionSuggestionBox(element) {
        const rect = element.getBoundingClientRect();
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;
        
        let left = rect.left + scrollX;
        let top = rect.bottom + scrollY + 5;
        
        // Ensure suggestion box stays within viewport
        const boxWidth = 300;
        const boxHeight = 200;
        
        if (left + boxWidth > window.innerWidth + scrollX) {
            left = window.innerWidth + scrollX - boxWidth - 10;
        }
        
        if (top + boxHeight > window.innerHeight + scrollY) {
            top = rect.top + scrollY - boxHeight - 5;
        }
        
        this.suggestionBox.style.left = Math.max(10, left) + 'px';
        this.suggestionBox.style.top = Math.max(10, top) + 'px';
        this.suggestionBox.style.minWidth = Math.min(300, rect.width) + 'px';
    }
    
    applySuggestion(suggestion, element) {
        const currentText = this.getElementText(element);
        const newText = currentText + (currentText.endsWith(' ') ? '' : ' ') + suggestion + ' ';
        
        // Handle different types of elements
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            // Standard form inputs
            element.value = newText;
            element.focus();
            
            // Set cursor position to end
            if (element.setSelectionRange) {
                element.setSelectionRange(newText.length, newText.length);
            }
        } else if (element.contentEditable === 'true') {
            // Contenteditable elements
            const selection = window.getSelection();
            const range = document.createRange();
            
            // Move cursor to end
            range.selectNodeContents(element);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
            
            // Insert text
            if (document.execCommand) {
                document.execCommand('insertText', false, ' ' + suggestion);
            } else {
                // Fallback for browsers that don't support execCommand
                const textNode = document.createTextNode(' ' + suggestion);
                range.insertNode(textNode);
                range.setStartAfter(textNode);
                range.setEndAfter(textNode);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }
        
        // Hide suggestions
        this.hideSuggestions();
        
        // Focus back to element
        element.focus();
        
        // Trigger input event to update the website's internal state
        const inputEvent = new Event('input', { bubbles: true });
        element.dispatchEvent(inputEvent);
        
        // Also trigger change event for some sites
        const changeEvent = new Event('change', { bubbles: true });
        element.dispatchEvent(changeEvent);
    }
    
    selectNextSuggestion(suggestions) {
        const selected = Array.from(suggestions).findIndex(s => s.classList.contains('selected'));
        const nextIndex = (selected + 1) % suggestions.length;
        
        suggestions.forEach((s, i) => {
            s.classList.toggle('selected', i === nextIndex);
            if (i === nextIndex) {
                s.style.backgroundColor = '#e3f2fd';
            } else {
                s.style.backgroundColor = '';
            }
        });
    }
    
    selectPrevSuggestion(suggestions) {
        const selected = Array.from(suggestions).findIndex(s => s.classList.contains('selected'));
        const prevIndex = selected <= 0 ? suggestions.length - 1 : selected - 1;
        
        suggestions.forEach((s, i) => {
            s.classList.toggle('selected', i === prevIndex);
            if (i === prevIndex) {
                s.style.backgroundColor = '#e3f2fd';
            } else {
                s.style.backgroundColor = '';
            }
        });
    }
    
    hideSuggestions() {
        if (this.suggestionBox) {
            this.suggestionBox.style.display = 'none';
        }
    }
    
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            switch (request.action) {
                case 'toggle':
                    this.isEnabled = request.enabled;
                    if (!this.isEnabled) {
                        this.hideSuggestions();
                    }
                    sendResponse({ success: true });
                    break;
                case 'getStatus':
                    sendResponse({ 
                        isEnabled: this.isEnabled,
                        attachedElements: this.attachedElements.size,
                        currentSite: window.location.hostname
                    });
                    break;
                case "settingsChanged":
                    console.log("Settings updated from popup:", request.settings);
                    console.log("Settings type:", typeof request.settings);
                    console.log("Settings keys:", Object.keys(request.settings || {}));
                    this.settings = request.settings;  // save new settings
                    console.log("Content script current settings after update:", this.settings);
                    console.log("Updated settings active_model:", this.settings?.active_model);
                    
                    if (this.currentInput && !this.shouldEnableForElement(this.currentInput)) {
                        this.hideSuggestions();
                    }
                    
                    sendResponse({ success: true });
                    break;
                }
            }
        );
    }
    
    toggle() {
        this.isEnabled = !this.isEnabled;
        if (!this.isEnabled) {
            this.hideSuggestions();
        }
        
        return this.isEnabled;
    }
}

function updateConnectionStatus(online, error = null) {
    if (!online) {
        console.error('Server offline:', error);
    } else {
        console.log('Server online and ready');
    }
}

// Helper function for sending messages to background script
function sendApiMessage(msg) { 
  return new Promise((resolve, reject) => { 
    chrome.runtime.sendMessage(msg, (response) => { 
      if (chrome.runtime.lastError) { 
        reject(new Error(chrome.runtime.lastError.message)); 
      } else if (!response.success) { 
        reject(new Error(response.error)); 
      } else { 
        resolve(response.data); 
      } 
    }); 
  }); 
}

// Initialize when the page loads
let assistant = null;

function initializeAssistant() {
    if (!assistant) {
        assistant = new Content();
        window.ngramAssistant = assistant;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAssistant);
} else {
    initializeAssistant();
}

window.addEventListener('load', () => {
    setTimeout(() => {
        if (assistant) {
            assistant.attachToExistingInputs();
        }
    }, 2000);
});