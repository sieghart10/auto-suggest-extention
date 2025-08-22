class API {
    constructor(baseUrl = 'http://localhost:8000') {
        this.baseUrl = baseUrl;
        this.initialized = false;

        this.initialize();
    }

    initialize() {
        if (this.initialized) return;
        
        this.initialized = true;
        console.log('API initialized successfully');
    }

    async call(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        const config = {
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        console.log(`Making ${config.method || 'GET'} request to ${url}`);

        try {
            // Create abort controller for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), config.timeout);

            const response = await fetch(url, {
                ...config,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.text().catch(() => null);
                let errorMessage;

                if (response.status === 404) {
                    errorMessage = `Resource not found: ${errorData || 'Unknown error'}`;
                } else if (response.status === 500) {
                    errorMessage = `Server error: ${errorData || 'Internal server error'}`;
                } else if (response.status === 503) {
                    errorMessage = `Service unavailable: ${errorData || 'Extension disabled'}`;
                } else {
                    errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                }

                throw new Error(errorMessage);
            }

            return await response.json();
        } catch (error) {
            console.error('API Error:', error.message);
            
            if (error.name === 'AbortError') {
                throw new Error('Request timeout - server may be slow');
            } else if (error instanceof TypeError && error.message.includes('fetch')) {
                throw new Error('Network error - check if server is running');
            }
            
            throw error;
        }
    }

    async checkServerStatus() {
        try {
            console.log('Checking server status...');
            const data = await this.call('/');
            console.log('Server status response:', data);
            return { online: true, data };
        } catch (error) {
            console.error('Server status check failed:', error.message);
            return { online: false, error: error.message };
        }
    }

    async healthCheck() {
        try {
            const data = await this.call('/health');
            return data;
        } catch (error) {
            throw new Error(`Health check failed: ${error.message}`);
        }
    }

    async getAvailableModels() {
        try {
            console.log('Fetching available models...');
            const data = await this.call('/models');
            console.log('Models response:', data);
            return data;
        } catch (error) {
            console.error('getAvailableModels error:', error.message);
            throw new Error(`Failed to fetch models: ${error.message}`);
        }
    }

    async switchModel(modelName) {
        try {
            const data = await this.call('/models/switch', {
                method: 'POST',
                body: JSON.stringify({
                    model_name: modelName
                })
            });
            return data;
        } catch (error) {
            throw new Error(`Model switch failed: ${error.message}`);
        }
    }

    async getSettings() {
        try {
            console.log('Fetching settings...');
            const data = await this.call('/settings');
            console.log('Settings response:', data);
            return data;
        } catch (error) {
            console.error('getSettings error:', error.message);
            throw new Error(`Failed to get settings: ${error.message}`);
        }
    }

    async updateSettings(settings) {
        try {
            const data = await this.call('/settings', {
                method: 'POST',
                body: JSON.stringify(settings)
            });
            return data;
        } catch (error) {
            throw new Error(`Settings update failed: ${error.message}`);
        }
    }

    async toggleExtension() {
        try {
            const data = await this.call('/toggle', {
                method: 'POST'
            });
            return data;
        } catch (error) {
            throw new Error(`Extension toggle failed: ${error.message}`);
        }
    }

    async predict(text, topK = 3, method = 'backoff') {
        try {
            const data = await this.call('/predict', {
                method: 'POST',
                body: JSON.stringify({
                    text,
                    top_k: topK,
                    method
                })
            });
            return data;
        } catch (error) {
            throw new Error(`Prediction failed: ${error.message}`);
        }
    }
}
