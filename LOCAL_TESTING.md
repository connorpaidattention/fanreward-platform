# LOCAL TESTING WITHOUT OAUTH
*How to test the platform using demo data and bypass OAuth*

---

## 🎯 OVERVIEW
This guide shows you how to test the FanReward Platform locally using pre-seeded demo data without needing OAuth credentials. Perfect for initial development and testing.

---

## ⚡ QUICK START

### 1. Prerequisites
- MongoDB running locally OR MongoDB Atlas connection configured
- Node.js 18+ installed
- Dependencies installed (`npm install`)

### 2. Start the Platform
```bash
# Navigate to project directory
cd "C:\Local Paid Attention Project\Paid Attention Development\fanreward-platform"

# Start development server
npm run dev

# In another terminal, seed demo data
node backend/scripts/seedData.js
```

### 3. Access Points
- **User App**: http://127.0.0.1:3000/
- **Admin Dashboard**: http://127.0.0.1:3000/admin/
- **API Health Check**: http://127.0.0.1:3000/api/health

---

## 👥 DEMO USER ACCOUNTS

The seed script creates these test accounts:

### Regular User Account
- **ID**: `demo_user_123`
- **Email**: `demo@fanreward.com`
- **Display Name**: `Demo User`
- **Points**: `1,250`
- **Status**: `active`
- **Connected Platforms**: Spotify, YouTube
- **JWT Token**: Automatically generated for testing

### Admin User Account  
- **ID**: `admin_user_456`
- **Email**: `admin@fanreward.com`
- **Display Name**: `Admin User`
- **Role**: `admin`
- **Points**: `5,000`
- **Status**: `active`
- **Connected Platforms**: All platforms
- **JWT Token**: Automatically generated for testing

---

## 🧪 TESTING SCENARIOS

### A. User Application Testing

#### 1. **Direct Database Login (Bypass OAuth)**
```bash
# The seed script creates demo JWT tokens that work without OAuth
# Tokens are automatically stored in browser localStorage when you visit the app
```

#### 2. **Test Real-time Features**
- Open user app: http://127.0.0.1:3000/
- Start a "Live Tracking" session
- Watch points increase in real-time (3x multiplier)
- Check Socket.IO connection in browser dev tools

#### 3. **Test Platform Management**
- Go to "Connections" section
- See pre-connected platforms (demo data)
- Try manual sync operations
- View sync history and status

#### 4. **Test Points & Rewards**
- View points breakdown by platform
- Check reward history
- Test referral code generation
- View leaderboard rankings

### B. Admin Dashboard Testing

#### 1. **Admin Authentication**
- Visit: http://127.0.0.1:3000/admin/
- Demo admin token is auto-loaded for testing
- Should bypass OAuth and go straight to dashboard

#### 2. **User Management**
- View all demo users in the system
- Search and filter functionality
- Test point adjustments on demo users
- View user details in modal

#### 3. **Platform Statistics**
- Check platform connection stats
- View sync performance charts
- Monitor error rates and activity

#### 4. **System Health**
- Monitor server status
- Check database connection
- View system metrics
- Test manual sync triggering

#### 5. **Audit Logs**
- View all system activities
- Filter by action types
- Search through audit history
- Check admin action tracking

---

## 🔍 API TESTING

### Health Check
```bash
curl http://127.0.0.1:3000/api/health
# Expected: {"status": "healthy", "database": "connected"}
```

### User Data (Using Demo Token)
```bash
# Get demo user data
curl -H "Authorization: Bearer DEMO_TOKEN_123" \
     http://127.0.0.1:3000/api/user/profile

# Get user rewards
curl -H "Authorization: Bearer DEMO_TOKEN_123" \
     http://127.0.0.1:3000/api/rewards/history
```

### Admin Endpoints (Using Demo Admin Token)
```bash
# Get dashboard stats
curl -H "Authorization: Bearer DEMO_ADMIN_TOKEN_456" \
     http://127.0.0.1:3000/api/admin/dashboard

# Get all users
curl -H "Authorization: Bearer DEMO_ADMIN_TOKEN_456" \
     http://127.0.0.1:3000/api/admin/users
```

---

## 📊 DEMO DATA BREAKDOWN

### Users Created
- 10 regular users with various activity levels
- 1 admin user with full privileges
- Different platform connection combinations
- Realistic point distributions (100-5000 points)

### Tracking Sessions
- 25+ demo tracking sessions
- Mix of live and historic sessions
- Various durations and point awards
- Different platform sources

### Reward Logs
- 50+ reward entries
- All reward types represented
- Different multiplier scenarios
- Admin adjustments included

### Platform Connections
- Spotify connections (8 users)
- YouTube connections (6 users)  
- Instagram connections (4 users)
- Various sync statuses and histories

---

## 🐛 COMMON TESTING ISSUES

### MongoDB Connection Issues
```bash
# Check MongoDB is running
# Windows: Check Services for "MongoDB"
# Or check process: tasklist | findstr mongod

# Test direct connection
node -e "const mongoose = require('mongoose'); mongoose.connect('mongodb://127.0.0.1:27017/fanreward').then(() => console.log('Connected!')).catch(err => console.error(err))"
```

### Seed Script Issues
```bash
# If seed script fails, try:
# 1. Ensure MongoDB is running
# 2. Delete existing database
# 3. Run seed script again
node backend/scripts/seedData.js --force
```

### Socket.IO Connection Issues
- Check browser console for Socket.IO errors
- Verify CORS settings in server.js
- Test connection at: http://127.0.0.1:3000/socket.io/

### Frontend Issues
- Check browser console for JavaScript errors
- Verify API endpoints are responding
- Test with browser dev tools Network tab

---

## 🚀 ADVANCED TESTING

### Load Testing
```bash
# Install artillery for load testing
npm install -g artillery

# Test API endpoints
artillery quick --count 10 --num 5 http://127.0.0.1:3000/api/health
```

### Database Testing
```javascript
// Connect to MongoDB and test queries
const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/fanreward');

const User = require('./backend/models/User');
User.find({}).then(users => console.log(`Found ${users.length} users`));
```

### Real-time Testing
1. Open multiple browser tabs to user app
2. Start live tracking in one tab
3. Watch real-time updates in other tabs
4. Check Socket.IO events in browser dev tools

---

## 📈 SUCCESS INDICATORS

### ✅ Everything Working When:
- Health check returns "healthy" status
- Demo users can access the platform without OAuth
- Admin can view dashboard and manage users
- Real-time tracking shows live point updates
- Socket.IO connects successfully
- Database queries return expected demo data
- No console errors in browser
- All API endpoints respond correctly

### ⚠️ Issues to Watch For:
- 500 server errors (usually database connection)
- Socket.IO connection failures
- Demo JWT tokens not working
- Missing demo data after seeding
- CORS errors in browser console

---

## 🔄 RESET TESTING ENVIRONMENT

If you need to start fresh:

```bash
# Stop the server (Ctrl+C)

# Clear database and reseed
node -e "
const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/fanreward')
  .then(() => mongoose.connection.db.dropDatabase())
  .then(() => console.log('Database cleared'))
  .then(() => process.exit(0));
"

# Reseed demo data
node backend/scripts/seedData.js

# Restart server
npm run dev
```

This testing setup allows you to fully evaluate the FanReward Platform without external OAuth dependencies!