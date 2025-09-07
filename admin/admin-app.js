// Main Admin Application Logic

class AdminApp {
    constructor() {
        this.currentSection = 'dashboard';
        this.currentPage = { users: 1, audit: 1 };
        this.charts = {};
        this.data = {
            dashboard: null,
            users: null,
            platforms: null,
            system: null,
            audit: null
        };
        this.filters = {
            users: { search: '', status: '' },
            audit: { search: '', action: '' }
        };
    }

    async init() {
        try {
            this.setupEventListeners();
            this.showSection('dashboard');
            await this.loadDashboardData();
        } catch (error) {
            console.error('Admin app initialization failed:', error);
            showNotification('Failed to initialize admin dashboard', 'error');
        }
    }

    setupEventListeners() {
        // Search inputs with debounce
        const userSearch = document.getElementById('userSearch');
        const auditSearch = document.getElementById('auditSearch');
        
        if (userSearch) {
            userSearch.addEventListener('input', this.debounce((e) => {
                this.filters.users.search = e.target.value;
                this.loadUsers();
            }, 500));
        }

        if (auditSearch) {
            auditSearch.addEventListener('input', this.debounce((e) => {
                this.filters.audit.search = e.target.value;
                this.loadAuditLogs();
            }, 500));
        }

        // Filter selects
        const userStatusFilter = document.getElementById('userStatusFilter');
        const auditActionFilter = document.getElementById('auditActionFilter');

        if (userStatusFilter) {
            userStatusFilter.addEventListener('change', (e) => {
                this.filters.users.status = e.target.value;
                this.loadUsers();
            });
        }

        if (auditActionFilter) {
            auditActionFilter.addEventListener('change', (e) => {
                this.filters.audit.action = e.target.value;
                this.loadAuditLogs();
            });
        }
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    async loadDashboardData() {
        try {
            showLoading(true);
            const dashboardData = await AdminDashboardAPI.getDashboard();
            this.data.dashboard = dashboardData;
            this.renderDashboardStats(dashboardData);
            this.renderDashboardCharts(dashboardData);
            await this.loadRecentActivity();
        } catch (error) {
            console.error('Failed to load dashboard:', error);
            showNotification('Failed to load dashboard data', 'error');
        } finally {
            showLoading(false);
        }
    }

    renderDashboardStats(data) {
        const stats = data.stats || {};
        
        // Update stat numbers
        document.getElementById('totalUsers').textContent = formatNumber(stats.totalUsers || 0);
        document.getElementById('activeConnections').textContent = formatNumber(stats.activeConnections || 0);
        document.getElementById('totalRewards').textContent = formatNumber(stats.totalRewards || 0);
        document.getElementById('activeSessions').textContent = formatNumber(stats.activeSessions || 0);

        // Update stat changes
        document.getElementById('newUsers').textContent = `+${stats.newUsers || 0} today`;
        document.getElementById('totalConnections').textContent = `${stats.totalConnections || 0} total`;
        document.getElementById('recentRewards').textContent = `+${stats.recentRewards || 0} recent`;
        document.getElementById('totalSessions').textContent = `${stats.totalSessions || 0} total`;
    }

    renderDashboardCharts(data) {
        // Platform Distribution Chart
        const platformCtx = document.getElementById('platformChart');
        if (platformCtx && data.platformStats) {
            this.charts.platform = new Chart(platformCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Spotify', 'YouTube', 'Instagram'],
                    datasets: [{
                        data: [
                            data.platformStats.spotify?.connections || 0,
                            data.platformStats.youtube?.connections || 0,
                            data.platformStats.instagram?.connections || 0
                        ],
                        backgroundColor: ['#1DB954', '#FF0000', '#E4405F'],
                        borderColor: '#FFFFFF',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            position: 'bottom'
                        }
                    }
                }
            });
        }

        // Activity Chart
        const activityCtx = document.getElementById('activityChart');
        if (activityCtx && data.activityData) {
            this.charts.activity = new Chart(activityCtx, {
                type: 'line',
                data: {
                    labels: data.activityData.labels || [],
                    datasets: [{
                        label: 'Active Users',
                        data: data.activityData.values || [],
                        borderColor: '#1A3C34',
                        backgroundColor: 'rgba(26, 60, 52, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        }
    }

    async loadRecentActivity() {
        try {
            const auditData = await AdminDashboardAPI.getAuditLogs(1, 10);
            const activityList = document.getElementById('recentActivityList');
            
            if (auditData.logs && auditData.logs.length > 0) {
                activityList.innerHTML = auditData.logs.map(log => `
                    <div class="activity-item">
                        <div class="activity-icon">
                            <i class="fas fa-${this.getActivityIcon(log.action)}"></i>
                        </div>
                        <div class="activity-content">
                            <div class="activity-description">${log.description}</div>
                            <div class="activity-meta">
                                <span>${formatDateRelative(log.timestamp)}</span>
                                <span class="activity-admin">by ${log.adminUser || 'System'}</span>
                            </div>
                        </div>
                    </div>
                `).join('');
            } else {
                activityList.innerHTML = '<div class="no-data">No recent activity</div>';
            }
        } catch (error) {
            console.error('Failed to load recent activity:', error);
            document.getElementById('recentActivityList').innerHTML = 
                '<div class="error-message">Failed to load recent activity</div>';
        }
    }

    getActivityIcon(action) {
        const icons = {
            manual: 'hand-point-right',
            update: 'edit',
            delete: 'trash',
            sync: 'sync',
            login: 'sign-in-alt',
            logout: 'sign-out-alt'
        };
        return icons[action] || 'info-circle';
    }

    async loadUsers() {
        try {
            const { search, status } = this.filters.users;
            const page = this.currentPage.users;
            
            showLoading(true);
            const userData = await AdminDashboardAPI.getUsers(page, 20, search, status);
            this.data.users = userData;
            this.renderUsersTable(userData);
            this.renderUsersPagination(userData);
        } catch (error) {
            console.error('Failed to load users:', error);
            showNotification('Failed to load users', 'error');
        } finally {
            showLoading(false);
        }
    }

    renderUsersTable(data) {
        const tbody = document.getElementById('usersTableBody');
        
        if (data.users && data.users.length > 0) {
            tbody.innerHTML = data.users.map(user => `
                <tr>
                    <td>
                        <div class="user-info">
                            <div class="user-name">${user.displayName || 'No Name'}</div>
                            <div class="user-id">${user._id.slice(-8)}</div>
                        </div>
                    </td>
                    <td>${user.email || 'No Email'}</td>
                    <td class="points-cell">
                        <span class="points-value">${formatNumber(user.totalPoints || 0)}</span>
                    </td>
                    <td>
                        <div class="platform-badges">
                            ${user.connectedPlatforms?.map(platform => 
                                `<span class="platform-badge ${platform}">${platform}</span>`
                            ).join('') || '<span class="no-platforms">None</span>'}
                        </div>
                    </td>
                    <td>
                        <span class="${getStatusBadge(user.status || 'active')}">${user.status || 'active'}</span>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-icon" onclick="viewUser('${user._id}')" title="View Details">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn-icon" onclick="editUserPoints('${user._id}')" title="Adjust Points">
                                <i class="fas fa-coins"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="no-data">No users found</td></tr>';
        }
    }

    renderUsersPagination(data) {
        const container = document.getElementById('usersPagination');
        if (data.pagination) {
            const pagination = createPagination(
                data.pagination.currentPage,
                data.pagination.totalPages,
                (page) => {
                    this.currentPage.users = page;
                    this.loadUsers();
                }
            );
            container.innerHTML = '';
            container.appendChild(pagination);
        }
    }

    async loadPlatformStats() {
        try {
            showLoading(true);
            const platformData = await AdminDashboardAPI.getPlatformStats();
            this.data.platforms = platformData;
            this.renderPlatformStats(platformData);
        } catch (error) {
            console.error('Failed to load platform stats:', error);
            showNotification('Failed to load platform statistics', 'error');
        } finally {
            showLoading(false);
        }
    }

    renderPlatformStats(data) {
        const platforms = ['spotify', 'youtube', 'instagram'];
        
        platforms.forEach(platform => {
            const stats = data[platform] || {};
            document.getElementById(`${platform}Connections`).textContent = 
                formatNumber(stats.connections || 0);
            document.getElementById(`${platform}Points`).textContent = 
                formatNumber(stats.totalPoints || 0);
            document.getElementById(`${platform}Errors`).textContent = 
                formatNumber(stats.errors || 0);
        });

        // Sync performance chart
        const syncCtx = document.getElementById('syncChart');
        if (syncCtx && data.syncPerformance) {
            if (this.charts.sync) {
                this.charts.sync.destroy();
            }
            
            this.charts.sync = new Chart(syncCtx, {
                type: 'bar',
                data: {
                    labels: data.syncPerformance.labels || [],
                    datasets: [{
                        label: 'Successful Syncs',
                        data: data.syncPerformance.successful || [],
                        backgroundColor: '#1A3C34'
                    }, {
                        label: 'Failed Syncs',
                        data: data.syncPerformance.failed || [],
                        backgroundColor: '#DC3545'
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        }
    }

    async loadSystemHealth() {
        try {
            showLoading(true);
            const healthData = await AdminDashboardAPI.getSystemHealth();
            this.data.system = healthData;
            this.renderSystemHealth(healthData);
        } catch (error) {
            console.error('Failed to load system health:', error);
            showNotification('Failed to check system health', 'error');
        } finally {
            showLoading(false);
        }
    }

    renderSystemHealth(data) {
        // Server status
        const serverStatus = document.getElementById('serverStatus');
        const serverUptime = document.getElementById('serverUptime');
        const serverMemory = document.getElementById('serverMemory');

        if (data.server) {
            serverStatus.textContent = data.server.status || 'Unknown';
            serverStatus.className = `health-status ${data.server.status === 'healthy' ? 'healthy' : 'unhealthy'}`;
            serverUptime.textContent = formatDuration(data.server.uptime || 0);
            serverMemory.textContent = formatBytes(data.server.memoryUsage || 0);
        }

        // Database status
        const dbStatus = document.getElementById('dbStatus');
        const dbCollections = document.getElementById('dbCollections');
        const dbDocuments = document.getElementById('dbDocuments');

        if (data.database) {
            dbStatus.textContent = data.database.status || 'Unknown';
            dbStatus.className = `health-status ${data.database.connected ? 'healthy' : 'unhealthy'}`;
            dbCollections.textContent = data.database.collections || 0;
            dbDocuments.textContent = formatNumber(data.database.totalDocuments || 0);
        }
    }

    async loadAuditLogs() {
        try {
            const { search, action } = this.filters.audit;
            const page = this.currentPage.audit;
            
            showLoading(true);
            const auditData = await AdminDashboardAPI.getAuditLogs(page, 50, { search, action });
            this.data.audit = auditData;
            this.renderAuditTable(auditData);
            this.renderAuditPagination(auditData);
        } catch (error) {
            console.error('Failed to load audit logs:', error);
            showNotification('Failed to load audit logs', 'error');
        } finally {
            showLoading(false);
        }
    }

    renderAuditTable(data) {
        const tbody = document.getElementById('auditTableBody');
        
        if (data.logs && data.logs.length > 0) {
            tbody.innerHTML = data.logs.map(log => `
                <tr>
                    <td>${formatDate(log.timestamp)}</td>
                    <td>
                        <div class="user-info">
                            <div class="user-name">${log.user?.displayName || 'Unknown'}</div>
                            <div class="user-id">${log.userId?.slice(-8) || 'N/A'}</div>
                        </div>
                    </td>
                    <td>
                        <span class="action-badge action-${log.action}">${log.action}</span>
                    </td>
                    <td class="description-cell">${log.description}</td>
                    <td>${log.adminUser || 'System'}</td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="5" class="no-data">No audit logs found</td></tr>';
        }
    }

    renderAuditPagination(data) {
        const container = document.getElementById('auditPagination');
        if (data.pagination) {
            const pagination = createPagination(
                data.pagination.currentPage,
                data.pagination.totalPages,
                (page) => {
                    this.currentPage.audit = page;
                    this.loadAuditLogs();
                }
            );
            container.innerHTML = '';
            container.appendChild(pagination);
        }
    }

    showSection(sectionName) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[onclick="showSection('${sectionName}')"]`)?.classList.add('active');

        // Update sections
        document.querySelectorAll('.section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(`${sectionName}-section`)?.classList.add('active');

        this.currentSection = sectionName;

        // Load section data
        this.loadSectionData(sectionName);
    }

    async loadSectionData(sectionName) {
        switch (sectionName) {
            case 'dashboard':
                await this.loadDashboardData();
                break;
            case 'users':
                await this.loadUsers();
                break;
            case 'platforms':
                await this.loadPlatformStats();
                break;
            case 'system':
                await this.loadSystemHealth();
                break;
            case 'audit':
                await this.loadAuditLogs();
                break;
        }
    }
}

// Global functions called from HTML
function showSection(sectionName) {
    if (window.adminApp) {
        window.adminApp.showSection(sectionName);
    }
}

function refreshDashboard() {
    if (window.adminApp) {
        window.adminApp.loadDashboardData();
    }
}

function refreshPlatformStats() {
    if (window.adminApp) {
        window.adminApp.loadPlatformStats();
    }
}

function checkSystemHealth() {
    if (window.adminApp) {
        window.adminApp.loadSystemHealth();
    }
}

async function triggerManualSync() {
    try {
        showLoading(true);
        await AdminDashboardAPI.triggerSync();
        showNotification('Manual sync triggered successfully', 'success');
        
        // Refresh current section data
        if (window.adminApp) {
            window.adminApp.loadSectionData(window.adminApp.currentSection);
        }
    } catch (error) {
        console.error('Manual sync failed:', error);
        showNotification('Failed to trigger manual sync', 'error');
    } finally {
        showLoading(false);
    }
}

function viewUser(userId) {
    showModal('User Details', `
        <div class="user-details-loading">
            <i class="fas fa-spinner fa-spin"></i>
            Loading user details...
        </div>
    `);
    
    // Load user details
    AdminDashboardAPI.getUser(userId)
        .then(user => {
            const modalBody = document.getElementById('modalBody');
            modalBody.innerHTML = `
                <div class="user-details">
                    <div class="detail-section">
                        <h4>Basic Information</h4>
                        <div class="detail-grid">
                            <div class="detail-item">
                                <label>Display Name</label>
                                <span>${user.displayName || 'Not set'}</span>
                            </div>
                            <div class="detail-item">
                                <label>Email</label>
                                <span>${user.email || 'Not set'}</span>
                            </div>
                            <div class="detail-item">
                                <label>Total Points</label>
                                <span>${formatNumber(user.totalPoints || 0)}</span>
                            </div>
                            <div class="detail-item">
                                <label>Status</label>
                                <span class="${getStatusBadge(user.status || 'active')}">${user.status || 'active'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="detail-section">
                        <h4>Platform Connections</h4>
                        <div class="platform-connections">
                            ${user.connectedPlatforms?.map(platform => `
                                <div class="connection-item">
                                    <i class="fab fa-${platform}"></i>
                                    <span>${platform.charAt(0).toUpperCase() + platform.slice(1)}</span>
                                    <span class="connection-status connected">Connected</span>
                                </div>
                            `).join('') || '<div class="no-connections">No platform connections</div>'}
                        </div>
                    </div>
                </div>
            `;
        })
        .catch(error => {
            console.error('Failed to load user details:', error);
            document.getElementById('modalBody').innerHTML = 
                '<div class="error-message">Failed to load user details</div>';
        });
}

function editUserPoints(userId) {
    showModal('Adjust User Points', `
        <form id="pointsForm" onsubmit="submitPointsAdjustment(event, '${userId}')">
            <div class="form-group">
                <label for="pointsAmount">Points Amount</label>
                <input type="number" id="pointsAmount" required>
                <small>Use negative numbers to subtract points</small>
            </div>
            <div class="form-group">
                <label for="pointsReason">Reason</label>
                <textarea id="pointsReason" required placeholder="Explain why you're adjusting these points..."></textarea>
            </div>
            <div class="form-group">
                <label for="pointsType">Type</label>
                <select id="pointsType">
                    <option value="manual">Manual Adjustment</option>
                    <option value="bonus">Bonus Points</option>
                    <option value="penalty">Penalty</option>
                    <option value="correction">Correction</option>
                </select>
            </div>
        </form>
    `, `
        <button type="submit" form="pointsForm" class="btn btn-primary">Apply Adjustment</button>
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    `);
}

async function submitPointsAdjustment(event, userId) {
    event.preventDefault();
    
    try {
        showLoading(true);
        
        const points = parseInt(document.getElementById('pointsAmount').value);
        const reason = document.getElementById('pointsReason').value;
        const type = document.getElementById('pointsType').value;
        
        await AdminDashboardAPI.adjustUserPoints(userId, points, reason, type);
        
        closeModal();
        showNotification('Points adjusted successfully', 'success');
        
        // Refresh users table if on users section
        if (window.adminApp?.currentSection === 'users') {
            window.adminApp.loadUsers();
        }
        
    } catch (error) {
        console.error('Failed to adjust points:', error);
        showNotification('Failed to adjust user points', 'error');
    } finally {
        showLoading(false);
    }
}

function showModal(title, body, footer = null) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = body;
    
    if (footer) {
        document.getElementById('modalFooter').innerHTML = footer;
    } else {
        document.getElementById('modalFooter').innerHTML = 
            '<button class="btn btn-secondary" onclick="closeModal()">Close</button>';
    }
    
    document.getElementById('modalOverlay').classList.add('show');
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('show');
}

// Initialize admin app when auth is ready
window.adminApp = new AdminApp();