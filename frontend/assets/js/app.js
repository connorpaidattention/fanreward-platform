// Main Application Logic

class FanRewardApp {
    constructor() {
        this.user = null;
        this.socket = null;
        this.currentSession = null;
        this.trackingInterval = null;
        this.sessionStartTime = null;
        this.platforms = {};
        this.init = this.init.bind(this);
    }
    
    async init() {
        try {
            await this.loadUserData();
            await this.loadPlatformData();
            this.setupSocket();
            this.setupUI();
            this.startPeriodicUpdates();
            
            console.log('FanReward App initialized successfully');
        } catch (error) {
            console.error('App initialization failed:', error);
            showNotification('Failed to initialize app', 'error');
        }
    }
    
    async loadUserData() {
        try {
            const [profile, points] = await Promise.all([
                UserAPI.getProfile(),
                RewardsAPI.getPoints()
            ]);
            
            this.user = profile;
            this.updateUserDisplay(profile, points);
            
        } catch (error) {
            console.error('Failed to load user data:', error);
            throw error;
        }
    }
    
    async loadPlatformData() {
        try {
            const connections = await PlatformsAPI.getConnections();
            this.platforms = {};
            
            connections.connections.forEach(conn => {
                this.platforms[conn.platform] = conn;
            });
            
            this.updatePlatformDisplay();
            
        } catch (error) {
            console.error('Failed to load platform data:', error);
            throw error;
        }
    }
    
    updateUserDisplay(profile, points) {
        // Update user name
        const userNameEl = document.getElementById('userName');
        if (userNameEl) {
            userNameEl.textContent = profile.firstName || profile.displayName || 'User';
        }
        
        // Update points display
        const pointsEl = document.getElementById('pointsDisplay');
        if (pointsEl && points) {
            pointsEl.textContent = formatNumber(points.totalPoints || 0);
        }
        
        // Update points breakdown
        const breakdownEl = document.getElementById('pointsBreakdown');
        if (breakdownEl && points && points.pointsBreakdown) {
            const breakdown = points.pointsBreakdown;
            breakdownEl.innerHTML = `
                <div class="breakdown-item">
                    <div class="breakdown-value">${formatNumber(breakdown.spotify || 0)}</div>
                    <div class="breakdown-label">Spotify</div>
                </div>
                <div class="breakdown-item">
                    <div class="breakdown-value">${formatNumber(breakdown.youtube || 0)}</div>
                    <div class="breakdown-label">YouTube</div>
                </div>
                <div class="breakdown-item">
                    <div class="breakdown-value">${formatNumber(breakdown.liveTracking || 0)}</div>
                    <div class="breakdown-label">Live</div>
                </div>
            `;
        }
        
        // Update referral code
        const referralEl = document.getElementById('referralCode');
        if (referralEl && profile.referralCode) {
            referralEl.textContent = profile.referralCode;
        }
    }
    
    updatePlatformDisplay() {
        const platforms = ['spotify', 'youtube', 'instagram'];
        
        platforms.forEach(platform => {
            const connection = this.platforms[platform];
            const statusEl = document.getElementById(`${platform}Status`);
            const btnEl = document.getElementById(`${platform}Btn`);
            const cardEl = document.getElementById(`${platform}Card`);
            
            if (connection && connection.status === 'connected') {
                if (statusEl) {
                    statusEl.textContent = 'Connected & earning points';
                    statusEl.classList.add('connected');
                }
                if (btnEl) {
                    btnEl.textContent = 'Manage';
                    btnEl.className = 'btn btn-connected';
                }
                if (cardEl) {
                    cardEl.classList.add('connected');
                }
            } else {
                if (statusEl) {
                    statusEl.textContent = 'Not connected';
                    statusEl.classList.remove('connected');
                }
                if (btnEl) {
                    btnEl.textContent = 'Connect';
                    btnEl.className = 'btn btn-secondary';
                }
                if (cardEl) {
                    cardEl.classList.remove('connected');
                }
            }
        });
        
        // Update player status
        this.updatePlayerStatus();
    }
    
    updatePlayerStatus() {
        const playerContainer = document.getElementById('playerContainer');
        const liveTrackBtn = document.getElementById('liveTrackBtn');
        const historicBtn = document.getElementById('historicBtn');
        
        const hasSpotify = this.platforms.spotify && this.platforms.spotify.status === 'connected';
        
        if (!hasSpotify) {
            if (playerContainer) {
                playerContainer.innerHTML = `
                    <div class="player-placeholder">
                        <div class="player-icon">🎵</div>
                        <div class="player-text">Connect Spotify to start earning 3x points for live listening!</div>
                    </div>
                `;
            }
            if (liveTrackBtn) {
                liveTrackBtn.disabled = true;
                liveTrackBtn.textContent = 'Connect Spotify First';
            }
        } else {
            if (liveTrackBtn) {
                liveTrackBtn.disabled = false;
                liveTrackBtn.textContent = this.currentSession ? 'Stop Tracking' : 'Start Live Tracking';
            }
        }
        
        if (historicBtn) {
            historicBtn.disabled = !hasSpotify;
        }
    }
    
    setupSocket() {
        if (this.socket) {
            this.socket.disconnect();
        }
        
        const token = localStorage.getItem('fanreward_token');
        if (!token) return;
        
        this.socket = io(API_BASE_URL, {
            auth: { token },
            transports: ['websocket', 'polling']
        });
        
        this.socket.on('connect', () => {
            console.log('Socket connected');
            this.updateStatusIndicator('online');
            
            if (this.user) {
                this.socket.emit('join-user-room', this.user.id);
            }
        });
        
        this.socket.on('disconnect', () => {
            console.log('Socket disconnected');
            this.updateStatusIndicator('offline');
        });
        
        this.socket.on('tracking-started', (data) => {
            console.log('Live tracking started:', data);
            this.currentSession = data.sessionId;
            this.sessionStartTime = Date.now();
            this.startTrackingUI();
        });
        
        this.socket.on('points-updated', (data) => {
            console.log('Points updated:', data);
            this.handlePointsUpdate(data);
        });
        
        this.socket.on('tracking-stopped', (data) => {
            console.log('Live tracking stopped:', data);
            this.stopTrackingUI();
        });
        
        this.socket.on('tracking-error', (error) => {
            console.error('Tracking error:', error);
            showNotification(error.message || 'Tracking error occurred', 'error');
            this.stopTrackingUI();
        });
        
        // Store socket globally
        window.socket = this.socket;
    }
    
    updateStatusIndicator(status) {
        const indicator = document.getElementById('statusIndicator');
        if (indicator) {
            indicator.className = `status-${status}`;
            
            switch (status) {
                case 'online':
                    indicator.textContent = '● ONLINE';
                    break;
                case 'tracking':
                    indicator.textContent = '● LIVE TRACKING ACTIVE';
                    break;
                default:
                    indicator.textContent = '● OFFLINE';
            }
        }
    }
    
    startTrackingUI() {
        const playerContainer = document.getElementById('playerContainer');
        const liveTrackBtn = document.getElementById('liveTrackBtn');
        
        if (playerContainer) {
            playerContainer.innerHTML = `
                <div class="live-player">
                    <div class="now-playing">
                        <div class="track-info">
                            <div class="track-title">🎵 Now Playing</div>
                            <div class="track-name">Listening to your music...</div>
                            <div class="artist-name">Connect your Spotify player</div>
                        </div>
                        <div class="tracking-indicator">
                            <span style="color: #D4A017;">●</span> Earning 3x points
                        </div>
                        <div class="session-timer" id="sessionTimer">00:00</div>
                    </div>
                </div>
            `;
        }
        
        if (liveTrackBtn) {
            liveTrackBtn.textContent = 'Stop Tracking';
            liveTrackBtn.className = 'btn btn-gold';
        }
        
        this.updateStatusIndicator('tracking');
        this.startSessionTimer();
        showNotification('Live tracking started! Keep listening to earn 3x points!', 'success');
    }
    
    stopTrackingUI() {
        const playerContainer = document.getElementById('playerContainer');
        const liveTrackBtn = document.getElementById('liveTrackBtn');
        
        if (playerContainer) {
            playerContainer.innerHTML = `
                <div class="player-placeholder">
                    <div class="player-icon">🎵</div>
                    <div class="player-text">Ready to start live tracking!</div>
                </div>
            `;
        }
        
        if (liveTrackBtn) {
            liveTrackBtn.textContent = 'Start Live Tracking';
            liveTrackBtn.className = 'btn btn-primary';
        }
        
        this.currentSession = null;
        this.sessionStartTime = null;
        this.updateStatusIndicator('online');
        this.stopSessionTimer();
        showNotification('Live tracking session completed!', 'success');
    }
    
    startSessionTimer() {
        this.stopSessionTimer(); // Clear any existing timer
        
        this.trackingInterval = setInterval(() => {
            if (this.sessionStartTime) {
                const elapsed = Math.floor((Date.now() - this.sessionStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                
                const timerEl = document.getElementById('sessionTimer');
                if (timerEl) {
                    timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                }
                
                // Send periodic updates to backend (every 30 seconds)
                if (elapsed > 0 && elapsed % 30 === 0 && this.currentSession) {
                    this.sendTrackingUpdate();
                }
            }
        }, 1000);
    }
    
    stopSessionTimer() {
        if (this.trackingInterval) {
            clearInterval(this.trackingInterval);
            this.trackingInterval = null;
        }
    }
    
    async sendTrackingUpdate() {
        if (!this.currentSession || !this.socket) return;
        
        const elapsed = Math.floor((Date.now() - this.sessionStartTime) / 1000);
        
        this.socket.emit('update-live-tracking', {
            sessionId: this.currentSession,
            duration: 30, // 30 second intervals
            position: elapsed
        });
    }
    
    handlePointsUpdate(data) {
        // Update points display
        const pointsEl = document.getElementById('pointsDisplay');
        if (pointsEl && data.totalPoints) {
            pointsEl.textContent = formatNumber(data.totalPoints);
        }
        
        // Show points notification
        if (data.pointsAwarded > 0) {
            showNotification(`+${data.pointsAwarded} points earned!`, 'success');
        }
        
        // Update recent activity
        this.refreshRecentActivity();
    }
    
    setupUI() {
        // Load recent activity
        this.refreshRecentActivity();
        
        // Setup referral sharing
        const shareBtn = document.querySelector('.btn-gold');
        if (shareBtn) {
            shareBtn.onclick = () => this.shareReferral();
        }
    }
    
    async refreshRecentActivity() {
        try {
            const response = await RewardsAPI.getHistory(1, 5);
            const activityContainer = document.getElementById('recentActivity');
            
            if (activityContainer && response.rewards && response.rewards.length > 0) {
                activityContainer.innerHTML = response.rewards.map(reward => `
                    <div class="activity-item">
                        <div class="activity-info">
                            <div class="activity-title">${reward.description}</div>
                            <div class="activity-details">${formatDate(reward.createdAt)} • ${reward.source}</div>
                        </div>
                        <div class="activity-points">+${formatNumber(reward.pointsAwarded)}</div>
                    </div>
                `).join('');
            } else if (activityContainer) {
                activityContainer.innerHTML = '<div class="activity-placeholder">No recent activity</div>';
            }
        } catch (error) {
            console.error('Failed to load recent activity:', error);
        }
    }
    
    async refreshData() {
        try {
            await this.loadUserData();
            await this.loadPlatformData();
            await this.refreshRecentActivity();
        } catch (error) {
            console.error('Failed to refresh data:', error);
        }
    }
    
    startPeriodicUpdates() {
        // Refresh data every 5 minutes
        setInterval(async () => {
            try {
                await this.refreshData();
            } catch (error) {
                console.warn('Periodic update failed:', error);
            }
        }, 5 * 60 * 1000);
    }
    
    shareReferral() {
        if (!this.user || !this.user.referralCode) {
            showNotification('Referral code not available', 'error');
            return;
        }
        
        const referralUrl = `${window.location.origin}/?ref=${this.user.referralCode}`;
        
        if (navigator.share) {
            navigator.share({
                title: 'Join FanReward!',
                text: 'Earn points for your music passion! Use my referral code to get started.',
                url: referralUrl
            });
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(referralUrl);
            showNotification('Referral link copied to clipboard!', 'success');
        } else {
            // Fallback: show modal with link
            showModal(
                'Share Your Referral',
                `
                <div class="referral-share">
                    <p>Share this link with friends to earn 500 points each!</p>
                    <div class="referral-link">
                        <input type="text" value="${referralUrl}" readonly onclick="this.select()" />
                    </div>
                    <p><strong>Your code:</strong> ${this.user.referralCode}</p>
                </div>
                `,
                `<button class="btn btn-primary" onclick="closeModal()">Done</button>`
            );
        }
    }
}

// Global Functions for HTML onclick handlers
async function startLiveTracking() {
    const btn = document.getElementById('liveTrackBtn');
    if (btn.disabled) return;
    
    if (app.currentSession) {
        // Stop tracking
        if (app.socket) {
            app.socket.emit('stop-live-tracking', { sessionId: app.currentSession });
        }
    } else {
        // Start tracking
        if (app.socket) {
            app.socket.emit('start-live-tracking', {
                userId: app.user.id,
                platform: 'spotify',
                trackData: {
                    trackName: 'Live Listening',
                    artistName: 'Various Artists',
                    platform: 'spotify'
                }
            });
        }
    }
}

async function calculateHistoric() {
    const btn = document.getElementById('historicBtn');
    if (btn.disabled) return;
    
    try {
        btn.disabled = true;
        btn.innerHTML = '<div class="loading-spinner"></div> Syncing...';
        
        const response = await RewardsAPI.calculateHistoric('spotify');
        showNotification(response.message || `Earned ${response.pointsAwarded} points!`, 'success');
        
        // Refresh app data
        await app.refreshData();
        
    } catch (error) {
        console.error('Historic calculation failed:', error);
        showNotification(error.message || 'Sync failed. Please try again.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Sync History';
    }
}

function showUserProfile() {
    if (!app.user) return;
    
    const user = app.user;
    showModal(
        'User Profile',
        `
        <div class="profile-modal">
            <div class="profile-info">
                <div class="profile-field">
                    <label>Display Name</label>
                    <div>${user.displayName || 'Not set'}</div>
                </div>
                <div class="profile-field">
                    <label>Email</label>
                    <div>${user.email || 'Not set'}</div>
                </div>
                <div class="profile-field">
                    <label>Member Since</label>
                    <div>${formatDate(user.createdAt)}</div>
                </div>
                <div class="profile-field">
                    <label>Current Streak</label>
                    <div>${user.currentStreak || 0} days</div>
                </div>
                <div class="profile-field">
                    <label>Lifetime Points</label>
                    <div>${formatNumber(user.lifetimePointsEarned || 0)}</div>
                </div>
                <div class="profile-field">
                    <label>Rank</label>
                    <div>#${user.rank || 'Unranked'}</div>
                </div>
            </div>
        </div>
        `,
        `<button class="btn btn-primary" onclick="closeModal()">Close</button>`
    );
}

async function showRewardHistory() {
    try {
        const response = await RewardsAPI.getHistory(1, 20);
        
        showModal(
            'Reward History',
            `
            <div class="rewards-history">
                ${response.rewards.map(reward => `
                    <div class="history-item">
                        <div class="history-info">
                            <div class="history-title">${reward.description}</div>
                            <div class="history-details">
                                ${formatDate(reward.createdAt)} • ${reward.source} • ${reward.type}
                            </div>
                        </div>
                        <div class="history-points">+${formatNumber(reward.pointsAwarded)}</div>
                    </div>
                `).join('')}
                ${response.rewards.length === 0 ? '<div class="no-data">No rewards yet</div>' : ''}
            </div>
            `,
            `<button class="btn btn-primary" onclick="closeModal()">Close</button>`
        );
    } catch (error) {
        console.error('Failed to load reward history:', error);
        showNotification('Failed to load reward history', 'error');
    }
}

async function showLeaderboard() {
    try {
        const response = await UserAPI.getLeaderboard(10);
        
        showModal(
            'Leaderboard',
            `
            <div class="leaderboard">
                ${response.leaderboard.map((user, index) => `
                    <div class="leaderboard-item ${index < 3 ? 'top-three' : ''}">
                        <div class="rank">#${index + 1}</div>
                        <div class="user-info">
                            <div class="username">${user.displayName}</div>
                            <div class="join-date">Joined ${formatDate(user.createdAt)}</div>
                        </div>
                        <div class="user-points">${formatNumber(user.totalPoints)}</div>
                    </div>
                `).join('')}
                ${response.userRank ? `<div class="user-rank">Your rank: #${response.userRank}</div>` : ''}
            </div>
            `,
            `<button class="btn btn-primary" onclick="closeModal()">Close</button>`
        );
    } catch (error) {
        console.error('Failed to load leaderboard:', error);
        showNotification('Failed to load leaderboard', 'error');
    }
}

// Modal Functions
function showModal(title, body, footer) {
    const modal = document.getElementById('modalOverlay');
    const titleEl = document.getElementById('modalTitle');
    const bodyEl = document.getElementById('modalBody');
    const footerEl = document.getElementById('modalFooter');
    
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.innerHTML = body;
    if (footerEl) footerEl.innerHTML = footer;
    
    modal.classList.add('show');
}

function closeModal() {
    const modal = document.getElementById('modalOverlay');
    modal.classList.remove('show');
}

// Initialize app when DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new FanRewardApp();
    window.app = app; // Make available globally
});

// Global functions for HTML
window.startLiveTracking = startLiveTracking;
window.calculateHistoric = calculateHistoric;
window.showUserProfile = showUserProfile;
window.showRewardHistory = showRewardHistory;
window.showLeaderboard = showLeaderboard;
window.showModal = showModal;
window.closeModal = closeModal;