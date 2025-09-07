// Admin Authentication Handler

class AdminAuth {
    constructor() {
        this.isAuthenticated = false;
        this.user = null;
        this.checkAuthOnLoad();
    }

    async checkAuthOnLoad() {
        const token = localStorage.getItem('fanreward_admin_token');
        if (token) {
            try {
                const response = await AuthAPI.checkStatus();
                if (response.authenticated && response.user && response.user.role === 'admin') {
                    this.setUser(response.user);
                    this.showDashboard();
                } else {
                    this.clearAuth();
                    this.showAuthScreen();
                }
            } catch (error) {
                console.error('Auth check failed:', error);
                this.clearAuth();
                this.showAuthScreen();
            }
        } else {
            this.showAuthScreen();
        }
    }

    setUser(userData) {
        this.isAuthenticated = true;
        this.user = userData;
        
        // Update UI with user info
        const adminName = document.getElementById('adminName');
        if (adminName) {
            adminName.textContent = userData.displayName || userData.email || 'Admin';
        }
    }

    clearAuth() {
        this.isAuthenticated = false;
        this.user = null;
        localStorage.removeItem('fanreward_admin_token');
        localStorage.removeItem('fanreward_refresh_token');
    }

    showAuthScreen() {
        document.getElementById('authCheck').style.display = 'flex';
        document.getElementById('adminDashboard').style.display = 'none';
    }

    showDashboard() {
        document.getElementById('authCheck').style.display = 'none';
        document.getElementById('adminDashboard').style.display = 'block';
        
        // Initialize dashboard after showing it
        if (window.adminApp && typeof window.adminApp.init === 'function') {
            window.adminApp.init();
        }
    }

    async handleAuthCallback(urlParams) {
        try {
            showLoading(true);
            
            const code = urlParams.get('code');
            const state = urlParams.get('state');
            const platform = localStorage.getItem('oauth_platform');
            
            if (!code) {
                throw new Error('No authorization code received');
            }

            // Exchange code for tokens via our backend
            const response = await fetch(`/api/auth/${platform}/callback`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ code, state })
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Authentication failed');
            }

            // Check if user has admin role
            if (!data.user || data.user.role !== 'admin') {
                throw new Error('Admin access required. Contact support if you believe this is an error.');
            }

            // Store tokens
            localStorage.setItem('fanreward_admin_token', data.token);
            if (data.refreshToken) {
                localStorage.setItem('fanreward_refresh_token', data.refreshToken);
            }
            
            // Set user and show dashboard
            this.setUser(data.user);
            this.showDashboard();
            
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
            localStorage.removeItem('oauth_platform');
            
            showNotification('Admin authentication successful!', 'success');
            
        } catch (error) {
            console.error('Auth callback error:', error);
            showNotification(error.message || 'Authentication failed', 'error');
            this.clearAuth();
            this.showAuthScreen();
        } finally {
            showLoading(false);
        }
    }
}

// OAuth initialization functions (called from HTML buttons)
function startOAuth(platform) {
    try {
        showLoading(true);
        
        // Store platform for callback
        localStorage.setItem('oauth_platform', platform);
        
        // Admin-specific scopes and settings
        const oauthConfigs = {
            spotify: {
                clientId: 'demo_client_id', // Will be replaced with real credentials
                redirectUri: encodeURIComponent('http://127.0.0.1:3000/admin/'),
                scopes: 'user-read-private user-read-email user-top-read user-read-recently-played',
                baseUrl: 'https://accounts.spotify.com/authorize'
            },
            google: {
                clientId: 'demo_client_id',
                redirectUri: encodeURIComponent('http://127.0.0.1:3000/admin/'),
                scopes: 'openid profile email https://www.googleapis.com/auth/youtube.readonly',
                baseUrl: 'https://accounts.google.com/o/oauth2/v2/auth'
            },
            facebook: {
                clientId: 'demo_client_id',
                redirectUri: encodeURIComponent('http://127.0.0.1:3000/admin/'),
                scopes: 'email,public_profile,instagram_basic',
                baseUrl: 'https://www.facebook.com/v18.0/dialog/oauth'
            }
        };

        const config = oauthConfigs[platform];
        if (!config) {
            throw new Error(`Unknown platform: ${platform}`);
        }

        // Generate state for security
        const state = Math.random().toString(36).substring(2, 15) + 
                     Math.random().toString(36).substring(2, 15);
        localStorage.setItem('oauth_state', state);

        // Build OAuth URL
        const params = new URLSearchParams({
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            scope: config.scopes,
            response_type: 'code',
            state: state,
            access_type: platform === 'google' ? 'offline' : undefined,
            prompt: platform === 'google' ? 'consent' : undefined
        });

        // Remove undefined values
        Object.keys(params).forEach(key => {
            if (params.get(key) === 'undefined') {
                params.delete(key);
            }
        });

        const authUrl = `${config.baseUrl}?${params}`;
        
        // Redirect to OAuth provider
        window.location.href = authUrl;
        
    } catch (error) {
        console.error('OAuth start error:', error);
        showNotification(error.message || 'Failed to start authentication', 'error');
        showLoading(false);
    }
}

async function logout() {
    try {
        showLoading(true);
        
        // Call logout API
        await AuthAPI.logout();
        
        // Clear local auth
        window.adminAuth.clearAuth();
        window.adminAuth.showAuthScreen();
        
        showNotification('Logged out successfully', 'success');
        
    } catch (error) {
        console.error('Logout error:', error);
        // Clear auth anyway
        window.adminAuth.clearAuth();
        window.adminAuth.showAuthScreen();
        showNotification('Logged out', 'info');
    } finally {
        showLoading(false);
    }
}

// Initialize authentication when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.adminAuth = new AdminAuth();
    
    // Check for OAuth callback parameters
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('code')) {
        window.adminAuth.handleAuthCallback(urlParams);
    }
});

// Handle refresh token expiration
window.addEventListener('storage', function(e) {
    if (e.key === 'fanreward_admin_token' && !e.newValue) {
        // Token was removed, redirect to auth
        if (window.adminAuth) {
            window.adminAuth.showAuthScreen();
        }
    }
});