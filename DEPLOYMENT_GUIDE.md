# 🚀 DEPLOYMENT GUIDE - paidattention.xyz

## Quick Railway Deployment (Recommended - 5 minutes)

### Step 1: Deploy to Railway
1. Go to [railway.app](https://railway.app) and sign up/login with GitHub
2. Click "Deploy from GitHub repo" 
3. Connect your GitHub account and select this repository
4. Railway will auto-detect Node.js and deploy automatically
5. **Important**: Railway will give you a URL like `fanreward-platform-production-xxxx.up.railway.app`

### Step 2: Configure Environment Variables in Railway
In Railway dashboard > Variables tab, add these:

```
NODE_ENV=production
PORT=3000
MONGODB_URI=[Your MongoDB Connection String]
SPOTIFY_CLIENT_ID=[Your Spotify Client ID]
SPOTIFY_CLIENT_SECRET=[Your Spotify Client Secret]
SPOTIFY_REDIRECT_URI=https://paidattention.xyz/api/auth/spotify/callback
GOOGLE_CLIENT_ID=[Your Google Client ID]
GOOGLE_CLIENT_SECRET=[Your Google Client Secret]
GOOGLE_REDIRECT_URI=https://paidattention.xyz/api/auth/google/callback
JWT_SECRET=[Generate a random secret]
SESSION_SECRET=[Generate a random secret]
ENABLE_BACKGROUND_JOBS=true
FRONTEND_URL=https://paidattention.xyz
ADMIN_URL=https://paidattention.xyz/admin
```

### Step 3: Configure Custom Domain in Railway
1. In Railway dashboard > Settings > Domains
2. Click "Add Domain"
3. Enter: `paidattention.xyz`
4. Railway will show you a CNAME record to add

### Step 4: Update DNS in Squarespace
1. Go to your Squarespace domain dashboard
2. Go to DNS Settings
3. Add a **CNAME record**:
   - **Name**: `@` (or leave blank for root domain)
   - **Value**: `[your-railway-app].up.railway.app` (Railway will tell you the exact value)
4. Save DNS changes (may take 5-30 minutes to propagate)

---

## 📱 OAuth Configuration Updates Needed

**CRITICAL**: Update these redirect URIs in your OAuth apps:

### Spotify Developer Dashboard
1. Go to [developer.spotify.com](https://developer.spotify.com/dashboard)
2. Select your app
3. Edit Settings > Redirect URIs
4. Add: `https://paidattention.xyz/api/auth/spotify/callback`

### Google Cloud Console  
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Navigate to APIs & Services > Credentials
3. Select your OAuth 2.0 Client ID
4. Add to "Authorized redirect URIs": `https://paidattention.xyz/api/auth/google/callback`

---

## 🎯 Testing Your Deployment

Once deployed and DNS propagated:

1. **Frontend**: https://paidattention.xyz
2. **Admin Dashboard**: https://paidattention.xyz/admin
3. **Health Check**: https://paidattention.xyz/api/health

### Test OAuth Flows:
- Spotify Login: https://paidattention.xyz/api/auth/spotify
- YouTube Login: https://paidattention.xyz/api/auth/google

---

## 🔧 If Something Goes Wrong

### Common Issues:
1. **502 Bad Gateway**: Environment variables not set correctly
2. **OAuth fails**: Redirect URIs not updated in OAuth providers
3. **DNS not resolving**: Wait longer (DNS can take up to 48hrs, usually 5-30min)

### Debugging:
- Check Railway logs in dashboard
- Verify all environment variables are set
- Test health endpoint first: `/api/health`

---

## 💡 Alternative Deployment (Render.com)

If Railway has issues:

1. Go to [render.com](https://render.com) 
2. "New" > "Web Service" > Connect GitHub repo
3. Use these settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Add all variables from above
4. Add custom domain in Render settings

---

**Your platform will be live at https://paidattention.xyz in ~10 minutes!**