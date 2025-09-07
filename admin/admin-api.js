// Admin API Integration

const API_BASE_URL = window.location.origin;
const API_PREFIX = '/api';

// API Helper with Admin Authentication
class AdminAPI {
    static async request(endpoint, options = {}) {
        const url = `${API_BASE_URL}${API_PREFIX}${endpoint}`;
        const token = localStorage.getItem('fanreward_admin_token');
        
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
                if (response.status === 403) {
                    throw new Error('Admin access required');
                } else if (response.status === 401) {
                    throw new Error('Authentication required');
                }
                throw new Error(data.error || `HTTP ${response.status}`);
            }
            
            return data;
        } catch (error) {
            console.error('Admin API Request Error:', error);
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

// Admin Dashboard API
const AdminDashboardAPI = {
    async getDashboard() {
        return AdminAPI.get('/admin/dashboard');
    },
    
    async getUsers(page = 1, limit = 20, search = '', status = '') {
        const params = new URLSearchParams({ page, limit });
        if (search) params.append('search', search);
        if (status) params.append('status', status);
        return AdminAPI.get(`/admin/users?${params}`);
    },
    
    async getUser(userId) {
        return AdminAPI.get(`/admin/users/${userId}`);
    },
    
    async updateUser(userId, updates) {
        return AdminAPI.put(`/admin/users/${userId}`, updates);
    },
    
    async adjustUserPoints(userId, points, reason, type = 'manual') {
        return AdminAPI.post(`/admin/users/${userId}/points`, { points, reason, type });
    },
    
    async getPlatformStats(timeframe = '30d') {
        return AdminAPI.get(`/admin/platforms/stats?timeframe=${timeframe}`);
    },
    
    async triggerSync(platform = null, userId = null) {
        return AdminAPI.post('/admin/sync', { platform, userId });
    },
    
    async getSystemHealth() {
        return AdminAPI.get('/admin/system/health');
    },
    
    async getAuditLogs(page = 1, limit = 50, filters = {}) {
        const params = new URLSearchParams({ page, limit, ...filters });
        return AdminAPI.get(`/admin/audit?${params}`);
    }
};

// Authentication API (reused from main app)
const AuthAPI = {
    async getMe() {
        return AdminAPI.get('/auth/me');
    },
    
    async logout() {
        return AdminAPI.post('/auth/logout');
    },
    
    async checkStatus() {
        return AdminAPI.get('/auth/status');
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
    return num ? num.toLocaleString() : '0';
}

function formatDate(dateString) {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

function formatDateRelative(dateString) {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffTime / (1000 * 60));
    
    if (diffDays > 0) {
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
        return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffMinutes > 0) {
        return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    } else {
        return 'Just now';
    }
}

function formatDuration(seconds) {
    if (!seconds) return '0s';
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (days > 0) {
        return `${days}d ${hours}h`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
}

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

function getStatusBadge(status) {
    const badges = {
        active: 'status-badge status-active',
        inactive: 'status-badge status-inactive',
        connected: 'status-badge status-connected',
        expired: 'status-badge status-expired',
        error: 'status-badge status-inactive',
        deleted: 'status-badge status-inactive'
    };
    
    return badges[status] || 'status-badge';
}

function createPagination(currentPage, totalPages, onPageClick) {
    const pagination = document.createElement('div');
    pagination.className = 'pagination';
    
    // Previous button
    const prevBtn = document.createElement('button');
    prevBtn.className = 'pagination-btn';
    prevBtn.textContent = '‹ Previous';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => onPageClick(currentPage - 1);
    pagination.appendChild(prevBtn);
    
    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    if (startPage > 1) {
        const firstBtn = document.createElement('button');
        firstBtn.className = 'pagination-btn';
        firstBtn.textContent = '1';
        firstBtn.onclick = () => onPageClick(1);
        pagination.appendChild(firstBtn);
        
        if (startPage > 2) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '...';
            ellipsis.className = 'pagination-info';
            pagination.appendChild(ellipsis);
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `pagination-btn ${i === currentPage ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.onclick = () => onPageClick(i);
        pagination.appendChild(pageBtn);
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '...';
            ellipsis.className = 'pagination-info';
            pagination.appendChild(ellipsis);
        }
        
        const lastBtn = document.createElement('button');
        lastBtn.className = 'pagination-btn';
        lastBtn.textContent = totalPages;
        lastBtn.onclick = () => onPageClick(totalPages);
        pagination.appendChild(lastBtn);
    }
    
    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.className = 'pagination-btn';
    nextBtn.textContent = 'Next ›';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => onPageClick(currentPage + 1);
    pagination.appendChild(nextBtn);
    
    // Page info
    const pageInfo = document.createElement('div');
    pageInfo.className = 'pagination-info';
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    pagination.appendChild(pageInfo);
    
    return pagination;
}

// Error Handler
window.addEventListener('unhandledrejection', event => {
    console.error('Unhandled promise rejection:', event.reason);
    showNotification('An unexpected error occurred. Please try again.', 'error');
});

// Auto-refresh admin token
setInterval(async () => {
    const token = localStorage.getItem('fanreward_admin_token');
    if (token) {
        try {
            const response = await AuthAPI.checkStatus();
            if (!response.authenticated) {
                // Token expired, redirect to login
                window.adminAuth?.showAuthScreen();
            }
        } catch (error) {
            console.warn('Admin token check failed:', error);
        }
    }
}, 10 * 60 * 1000); // Check every 10 minutes