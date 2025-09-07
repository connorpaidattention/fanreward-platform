// Authentication Management

class AuthManager {
    constructor() {
        this.token = localStorage.getItem('fanreward_token');
        this.user = null;
        this.checkAuthOnLoad();
    }
    
    async checkAuthOnLoad() {
        // Check for OAuth callback parameters
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        const connected = urlParams.get('connected');
        const success = urlParams.get('success');
        const error = urlParams.get('error');
        
        if (token) {
            // OAuth callback with token
            this.setToken(token);
            
            if (connected && success) {
                showNotification(`${connected} connected successfully!`, 'success');
            }
            
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
            
            // Load the main app
            await this.loadMainApp();
            return;
        }
        
        if (error) {
            // OAuth error
            showNotification(`Connection failed: ${error}`, 'error');
            window.history.replaceState({}, document.title, window.location.pathname);
        }
        
        // Check existing token
        if (this.token) {
            await this.validateToken();
        } else {
            this.showAuthScreen();
        }
    }
    
    async validateToken() {
        try {
            const response = await AuthAPI.checkStatus();
            if (response.authenticated) {
                this.user = response.user;
                await this.loadMainApp();
            } else {
                this.clearAuth();
                this.showAuthScreen();
            }
        } catch (error) {
            console.error('Token validation failed:', error);
            this.clearAuth();
            this.showAuthScreen();
        }
    }
    
    setToken(token) {
        this.token = token;
        localStorage.setItem('fanreward_token', token);
    }
    
    clearAuth() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('fanreward_token');
        localStorage.removeItem('fanreward_user');
    }
    
    showAuthScreen() {
        document.getElementById('authCheck').style.display = 'block';
        document.getElementById('mainApp').style.display = 'none';
        showLoading(false);
    }
    
    async loadMainApp() {
        try {
            // Get user profile
            const userProfile = await AuthAPI.getMe();
            this.user = userProfile;
            localStorage.setItem('fanreward_user', JSON.stringify(userProfile));
            
            // Show main app
            document.getElementById('authCheck').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            
            // Initialize the app
            if (window.app) {
                await window.app.init();
            }
            
        } catch (error) {
            console.error('Failed to load main app:', error);
            this.clearAuth();
            this.showAuthScreen();
        }
    }
    
    async logout() {
        try {
            await AuthAPI.logout();
        } catch (error) {
            console.warn('Logout API call failed:', error);
        } finally {
            this.clearAuth();
            this.showAuthScreen();
            showNotification('Logged out successfully', 'success');
            
            // Disconnect socket if connected
            if (window.socket) {
                window.socket.disconnect();
            }
        }
    }
}

// OAuth Functions
function startOAuth(platform) {
    showNotification(`Redirecting to ${platform}...`, 'info');
    
    // Add small delay for better UX
    setTimeout(() => {
        const authUrl = `${API_BASE_URL}/api/auth/${platform}`;
        window.location.href = authUrl;
    }, 500);
}

function handlePlatformAction(platform) {
    const button = document.getElementById(`${platform === 'google' ? 'youtube' : platform}Btn`);
    const isConnected = button.classList.contains('btn-connected') || button.disabled;
    
    if (isConnected) {
        // Show platform management options
        showPlatformModal(platform);
    } else {
        // Start OAuth connection
        startOAuth(platform);
    }
}

function showPlatformModal(platform) {
    const platformName = platform === 'google' ? 'YouTube' : platform.charAt(0).toUpperCase() + platform.slice(1);
    
    showModal(
        `${platformName} Connection`,
        `
        <div class="platform-modal">
            <p>Your ${platformName} account is connected and earning points!</p>
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="syncPlatform('${platform}')">Sync Now</button>
                <button class="btn btn-outline" onclick="viewPlatformStats('${platform}')">View Stats</button>
                <button class="btn btn-outline" onclick="disconnectPlatform('${platform}')">Disconnect</button>
            </div>
        </div>
        `,
        `<button class="btn btn-primary" onclick="closeModal()">Done</button>`
    );
}

async function syncPlatform(platform) {
    try {
        showNotification('Starting sync...', 'info');
        const response = await PlatformsAPI.manualSync(platform);
        showNotification(response.message || 'Sync completed!', 'success');
        
        // Refresh app data
        if (window.app) {
            await window.app.refreshData();
        }
        
        closeModal();
    } catch (error) {
        console.error('Sync failed:', error);
        showNotification(error.message || 'Sync failed. Please try again.', 'error');
    }
}

async function viewPlatformStats(platform) {
    try {
        const response = await PlatformsAPI.getSyncHistory(platform, 10);
        const stats = response.summary;
        
        const platformName = platform === 'google' ? 'YouTube' : platform.charAt(0).toUpperCase() + platform.slice(1);
        
        showModal(
            `${platformName} Statistics`,
            `
            <div class="stats-modal">
                <div class="stat-item">
                    <div class="stat-label">Total Points Earned</div>
                    <div class="stat-value">${formatNumber(stats.totalPointsAwarded || 0)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Items Processed</div>
                    <div class="stat-value">${formatNumber(stats.totalItemsProcessed || 0)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Last Sync</div>
                    <div class="stat-value">${stats.lastSyncAt ? formatDate(stats.lastSyncAt) : 'Never'}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Next Sync</div>
                    <div class="stat-value">${stats.nextSyncAt ? formatDate(stats.nextSyncAt) : 'Not scheduled'}</div>
                </div>
            </div>
            `,
            `<button class="btn btn-primary" onclick="closeModal()">Close</button>`
        );
    } catch (error) {
        console.error('Failed to load platform stats:', error);
        showNotification('Failed to load statistics', 'error');
    }
}

async function disconnectPlatform(platform) {
    const platformName = platform === 'google' ? 'YouTube' : platform.charAt(0).toUpperCase() + platform.slice(1);
    
    if (confirm(`Are you sure you want to disconnect your ${platformName} account? You will stop earning points from this platform.`)) {
        try {
            await PlatformsAPI.disconnect(platform);
            showNotification(`${platformName} disconnected successfully`, 'success');
            
            // Refresh app data
            if (window.app) {
                await window.app.refreshData();
            }
            
            closeModal();
        } catch (error) {
            console.error('Disconnect failed:', error);
            showNotification(error.message || 'Failed to disconnect. Please try again.', 'error');
        }
    }
}

// Initialize auth manager
const authManager = new AuthManager();

// Global functions for HTML onclick handlers
window.startOAuth = startOAuth;
window.handlePlatformAction = handlePlatformAction;
window.logout = () => authManager.logout();

// Export for other modules
window.authManager = authManager;