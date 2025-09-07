# PRODUCTION DEPLOYMENT GUIDE
*Complete deployment setup for FanReward Platform*

---

## 🎯 DEPLOYMENT ARCHITECTURE

### Recommended Production Stack
- **Backend**: Railway or Render (Node.js hosting)
- **Database**: MongoDB Atlas (Cloud database)
- **Frontend**: Vercel or Netlify (Static hosting)
- **Domain**: Custom domain with SSL
- **Monitoring**: Built-in health checks + external monitoring

---

## 🚀 DEPLOYMENT CHECKLIST

### ☐ Phase 1: Database Setup (MongoDB Atlas)
### ☐ Phase 2: Backend Deployment (Railway/Render)
### ☐ Phase 3: Frontend Deployment (Vercel/Netlify)
### ☐ Phase 4: Domain & SSL Configuration
### ☐ Phase 5: OAuth Production Setup
### ☐ Phase 6: Monitoring & Health Checks

---

## 📊 PHASE 1: DATABASE SETUP

### MongoDB Atlas Configuration
1. **Create Production Cluster**
   - Go to MongoDB Atlas (cloud.mongodb.com)
   - Create new cluster (M10+ for production)
   - Choose your preferred region
   - Configure cluster name: `fanreward-prod`

2. **Security Configuration**
   - Create database user for production
   - Set strong password (32+ characters)
   - Configure IP whitelist (your server's IP)
   - Enable MongoDB authentication

3. **Get Connection String**
   ```
   mongodb+srv://prod_user:STRONG_PASSWORD@fanreward-prod.xxxxx.mongodb.net/fanreward?retryWrites=true&w=majority
   ```

4. **Production Indexes** (Run these in MongoDB Compass)
   ```javascript
   // User collection
   db.users.createIndex({ "email": 1 }, { unique: true })
   db.users.createIndex({ "referralCode": 1 }, { unique: true })
   
   // TrackingSession collection  
   db.trackingsessions.createIndex({ "userId": 1, "startTime": -1 })
   
   // RewardLog collection
   db.rewardlogs.createIndex({ "userId": 1, "timestamp": -1 })
   
   // PlatformConnection collection
   db.platformconnections.createIndex({ "userId": 1, "platform": 1 }, { unique: true })
   ```

---

## 🖥️ PHASE 2: BACKEND DEPLOYMENT

### Option A: Railway (Recommended)

1. **Prepare for Deployment**
   ```bash
   # Add to package.json scripts
   "start": "node backend/server.js",
   "build": "echo 'No build step required'"
   ```

2. **Deploy to Railway**
   - Connect GitHub repository to Railway
   - Select `fanreward-platform` repository
   - Railway auto-detects Node.js app
   - Set build command: `npm install`
   - Set start command: `npm start`

3. **Environment Variables in Railway**
   ```bash
   NODE_ENV=production
   PORT=3000
   MONGODB_URI=mongodb+srv://prod_user:password@fanreward-prod.xxxxx.mongodb.net/fanreward
   JWT_SECRET=your_super_secure_32_char_jwt_secret_here
   REFRESH_TOKEN_SECRET=your_super_secure_32_char_refresh_secret_here
   SPOTIFY_CLIENT_ID=your_production_spotify_client_id
   SPOTIFY_CLIENT_SECRET=your_production_spotify_client_secret
   GOOGLE_CLIENT_ID=your_production_google_client_id
   GOOGLE_CLIENT_SECRET=your_production_google_client_secret
   FACEBOOK_APP_ID=your_production_facebook_app_id
   FACEBOOK_APP_SECRET=your_production_facebook_app_secret
   FRONTEND_URL=https://your-domain.com
   ADMIN_URL=https://admin.your-domain.com
   ```

### Option B: Render

1. **Create Render Service**
   - Connect GitHub to Render
   - Create new Web Service
   - Build command: `npm install`
   - Start command: `npm start`

2. **Configure Environment Variables** (same as Railway above)

---

## 🌐 PHASE 3: FRONTEND DEPLOYMENT

### User Application Deployment (Vercel)

1. **Create Vercel Project**
   ```bash
   # Install Vercel CLI
   npm i -g vercel
   
   # Deploy from frontend directory
   cd frontend
   vercel
   ```

2. **Configure `vercel.json`**
   ```json
   {
     "builds": [
       {
         "src": "public/**",
         "use": "@vercel/static"
       }
     ],
     "routes": [
       {
         "src": "/(.*)",
         "dest": "/public/$1"
       }
     ],
     "env": {
       "API_BASE_URL": "https://your-backend.railway.app"
     }
   }
   ```

### Admin Dashboard Deployment (Separate Subdomain)

1. **Create Admin Vercel Project**
   ```bash
   # Create separate deployment for admin
   # Deploy from admin directory
   cd admin
   vercel
   ```

2. **Configure Admin `vercel.json`**
   ```json
   {
     "builds": [
       {
         "src": "**",
         "use": "@vercel/static"
       }
     ],
     "routes": [
       {
         "src": "/(.*)",
         "dest": "/$1"
       }
     ]
   }
   ```

---

## 🌍 PHASE 4: DOMAIN & SSL CONFIGURATION

### Custom Domain Setup

1. **Purchase Domain** (GoDaddy, Namecheap, etc.)
   - Main app: `fanreward.com`  
   - Admin panel: `admin.fanreward.com`
   - API: `api.fanreward.com`

2. **Configure DNS Records**
   ```
   A     fanreward.com          → Vercel IP
   CNAME admin.fanreward.com    → admin-project.vercel.app
   CNAME api.fanreward.com      → your-backend.railway.app
   ```

3. **SSL Certificates**
   - Vercel: Auto-configures SSL
   - Railway: Auto-configures SSL
   - All connections will be HTTPS

---

## 🔐 PHASE 5: PRODUCTION OAUTH SETUP

### Update OAuth Applications for Production

#### Spotify Production URLs
```
Website: https://fanreward.com
Redirect URI: https://api.fanreward.com/api/auth/spotify/callback
```

#### Google Cloud Production URLs  
```
Authorized origins: https://fanreward.com
Redirect URI: https://api.fanreward.com/api/auth/google/callback
```

#### Facebook Production URLs
```
App Domains: fanreward.com
OAuth Redirect URIs: https://api.fanreward.com/api/auth/facebook/callback
```

### Production Environment Variables Update
```bash
# Update these in Railway/Render
SPOTIFY_REDIRECT_URI=https://api.fanreward.com/api/auth/spotify/callback
GOOGLE_REDIRECT_URI=https://api.fanreward.com/api/auth/google/callback
FACEBOOK_REDIRECT_URI=https://api.fanreward.com/api/auth/facebook/callback
```

---

## 📈 PHASE 6: MONITORING & HEALTH CHECKS

### Health Check Endpoints
```bash
# Backend health
curl https://api.fanreward.com/api/health

# Database health  
curl https://api.fanreward.com/api/admin/system/health
```

### Monitoring Setup

1. **Uptime Monitoring**
   - UptimeRobot (free tier)
   - Monitor: https://api.fanreward.com/api/health
   - Check every 5 minutes
   - Email/SMS alerts on downtime

2. **Performance Monitoring**
   - Railway/Render built-in metrics
   - MongoDB Atlas monitoring
   - Custom application metrics via API

3. **Error Tracking**
   ```javascript
   // Add to server.js for production
   if (process.env.NODE_ENV === 'production') {
     // Log errors to external service
     app.use((err, req, res, next) => {
       console.error('Production Error:', err);
       // Send to logging service (Papertrail, LogRocket, etc.)
       next(err);
     });
   }
   ```

---

## 🔧 PRODUCTION OPTIMIZATIONS

### Backend Performance
```javascript
// Add to server.js
const compression = require('compression');
const helmet = require('helmet');

app.use(compression());
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
```

### Database Optimizations
```javascript
// Connection pool settings
mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});
```

### Frontend Optimizations
- Enable gzip compression (auto in Vercel)
- Minify CSS and JavaScript
- Optimize images
- Add service worker for caching

---

## 🚨 SECURITY CHECKLIST

### Backend Security
- ✅ HTTPS everywhere
- ✅ Helmet.js security headers  
- ✅ Rate limiting on API endpoints
- ✅ JWT token expiration (7 days max)
- ✅ Input validation and sanitization
- ✅ CORS properly configured
- ✅ MongoDB connection secured

### Frontend Security
- ✅ No sensitive data in client-side code
- ✅ JWT tokens stored in httpOnly cookies (or localStorage with XSS protection)
- ✅ Input validation on all forms
- ✅ HTTPS-only cookie settings
- ✅ Content Security Policy headers

---

## 🔄 DEPLOYMENT AUTOMATION

### GitHub Actions CI/CD (Optional)
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test
      - name: Deploy to Railway
        uses: railway-app/actions@v1
        with:
          token: ${{ secrets.RAILWAY_TOKEN }}
```

---

## 📋 POST-DEPLOYMENT CHECKLIST

### ✅ Verification Steps
1. **Health Checks Pass**
   - Backend API responds
   - Database connection works
   - Socket.IO connects

2. **OAuth Flows Work**
   - Spotify login works
   - Google/YouTube login works  
   - Facebook/Instagram login works
   - Tokens refresh properly

3. **Core Features Function**
   - User registration/login
   - Points tracking and rewards
   - Real-time tracking sessions
   - Admin dashboard access
   - Platform sync operations

4. **Performance Metrics**
   - Page load times < 3 seconds
   - API response times < 500ms
   - Database queries optimized
   - No memory leaks

5. **Security Verification**
   - SSL certificates valid
   - Security headers present
   - No exposed secrets
   - Rate limiting working

---

## 📞 PRODUCTION SUPPORT

### Monitoring Dashboard URLs
- **Backend**: Railway/Render dashboard
- **Database**: MongoDB Atlas dashboard
- **Frontend**: Vercel dashboard
- **Uptime**: UptimeRobot dashboard

### Common Production Issues
1. **Database Connection Timeouts** → Check MongoDB Atlas IP whitelist
2. **OAuth Redirect Errors** → Verify production redirect URIs
3. **CORS Errors** → Update CORS origins for production domains
4. **Socket.IO Connection Fails** → Check WebSocket support on hosting platform

This deployment guide provides a complete production setup for the FanReward Platform with professional-grade hosting, monitoring, and security configurations.