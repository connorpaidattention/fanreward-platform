// API Configuration and Helper Functions

const API_BASE_URL = window.location.origin;
const API_PREFIX = '/api';

// API Helper Functions
class API {
    static async request(endpoint, options = {}) {
        const url = `${API_BASE_URL}${API_PREFIX}${endpoint}`;
        const token = localStorage.getItem('fanreward_token');
        
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` })
            }
        };
        
        const config = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        };
        
        try {
            showLoading(true);
            const response = await fetch(url, config);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}`);
            }
            
            return data;
        } catch (error) {
            console.error('API Request Error:', error);
            throw error;
        } finally {
            showLoading(false);
        }
    }
    
    static async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    }
    
    static async post(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
    
    static async put(endpoint, data) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }
    
    static async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }
}

// Authentication API
const AuthAPI = {
    async getMe() {
        return API.get('/auth/me');
    },
    
    async logout() {
        return API.post('/auth/logout');
    },
    
    async refreshToken() {
        return API.post('/auth/refresh');
    },
    
    async checkStatus() {
        return API.get('/auth/status');
    }
};

// User API
const UserAPI = {
    async getProfile() {
        return API.get('/user/profile');
    },
    
    async updateProfile(data) {
        return API.put('/user/profile', data);
    },
    
    async getStats(timeframe = '30d') {
        return API.get(`/user/stats?timeframe=${timeframe}`);
    },
    
    async getRewards(page = 1, limit = 20) {
        return API.get(`/user/rewards?page=${page}&limit=${limit}`);
    },
    
    async getSessions(page = 1, limit = 20, platform = null) {
        const params = new URLSearchParams({ page, limit });
        if (platform) params.append('platform', platform);
        return API.get(`/user/sessions?${params}`);
    },
    
    async getLeaderboard(limit = 10) {
        return API.get(`/user/leaderboard?limit=${limit}`);
    },
    
    async getConnections() {
        return API.get('/user/connections');
    },
    
    async getReferral() {
        return API.get('/user/referral');
    },
    
    async applyReferral(referralCode) {
        return API.post('/user/referral/apply', { referralCode });
    },
    
    async heartbeat() {
        return API.post('/user/heartbeat');
    }
};

// Rewards API
const RewardsAPI = {
    async getPoints() {
        return API.get('/rewards/points');
    },
    
    async calculateHistoric(platform) {
        return API.post('/rewards/calculate-historic', { platform });
    },
    
    async startLiveTracking(platform, trackData) {
        return API.post('/rewards/start-live-tracking', { platform, trackData });
    },
    
    async updateLiveTracking(sessionId, duration, position, trackData) {
        return API.post('/rewards/update-live-tracking', { 
            sessionId, duration, position, trackData 
        });
    },
    
    async stopLiveTracking(sessionId) {
        return API.post('/rewards/stop-live-tracking', { sessionId });
    },
    
    async getHistory(page = 1, limit = 20, filters = {}) {
        const params = new URLSearchParams({ page, limit, ...filters });
        return API.get(`/rewards/history?${params}`);
    },
    
    async getSummary(timeframe = '30d') {
        return API.get(`/rewards/summary?timeframe=${timeframe}`);
    },
    
    async getActiveSessions() {
        return API.get('/rewards/active-sessions');
    }
};

// Platforms API
const PlatformsAPI = {
    async getConnections() {
        return API.get('/platforms/connections');
    },
    
    async getConnection(platform) {
        return API.get(`/platforms/connections/${platform}`);
    },
    
    async disconnect(platform) {
        return API.delete(`/platforms/connections/${platform}`);
    },
    
    async refreshTokens(platform) {
        return API.post(`/platforms/connections/${platform}/refresh`);
    },
    
    async getSyncHistory(platform, limit = 10) {
        return API.get(`/platforms/connections/${platform}/sync-history?limit=${limit}`);
    },
    
    async manualSync(platform) {
        return API.post(`/platforms/connections/${platform}/sync`);
    },
    
    async updateSettings(platform, settings) {
        return API.put(`/platforms/connections/${platform}/settings`, settings);
    },
    
    async getStats(timeframe = '30d') {
        return API.get(`/platforms/stats?timeframe=${timeframe}`);
    },
    
    async testConnection(platform) {
        return API.post(`/platforms/test/${platform}`);
    }
};

// Utility Functions
function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.toggle('show', show);
    }
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    if (notification) {
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.add('show');
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, 4000);
    }
}

function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
        return 'Yesterday';
    } else if (diffDays < 7) {
        return `${diffDays} days ago`;
    } else {
        return date.toLocaleDateString();
    }
}

function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

// Error Handler
window.addEventListener('unhandledrejection', event => {
    console.error('Unhandled promise rejection:', event.reason);
    showNotification('An unexpected error occurred. Please try again.', 'error');
});

// Token Refresh Handler
async function handleTokenRefresh() {
    try {
        const response = await AuthAPI.refreshToken();
        if (response.token) {
            localStorage.setItem('fanreward_token', response.token);
            return true;
        }
    } catch (error) {
        console.error('Token refresh failed:', error);
        // Redirect to login
        logout();
    }
    return false;
}

// Auto-refresh token before expiry
setInterval(async () => {
    const token = localStorage.getItem('fanreward_token');
    if (token) {
        try {
            // Try to refresh token periodically
            await handleTokenRefresh();
        } catch (error) {
            // Token refresh failed, user will need to re-login
            console.warn('Background token refresh failed');
        }
    }
}, 6 * 60 * 60 * 1000); // Every 6 hours

// Heartbeat to keep session active
setInterval(async () => {
    const token = localStorage.getItem('fanreward_token');
    if (token) {
        try {
            await UserAPI.heartbeat();
        } catch (error) {
            console.warn('Heartbeat failed:', error);
        }
    }
}, 5 * 60 * 1000); // Every 5 minutes