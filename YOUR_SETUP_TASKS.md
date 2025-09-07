# YOUR SETUP TASKS
*Step-by-step guide for external setup requirements*

---

## 🗂️ OVERVIEW
This document contains **only the tasks you need to complete** to get the FanReward Platform fully operational. All code implementation is complete - we just need external services configured.

---

## 📋 SETUP CHECKLIST

### ☐ Task 1: MongoDB Database Setup
### ☐ Task 2: OAuth API Credentials  
### ☐ Task 3: Environment Configuration
### ☐ Task 4: Dependencies Installation
### ☐ Task 5: Initial Testing

---

## 💾 TASK 1: DATABASE SETUP

### Option A: Local MongoDB (Recommended for Development)
1. **Download & Install MongoDB Community Server**
   - Visit: https://www.mongodb.com/try/download/community
   - Download for Windows
   - Install with default settings
   - MongoDB will run on: `mongodb://127.0.0.1:27017`

### Option B: MongoDB Atlas (Cloud - Recommended for Production)
1. **Create MongoDB Atlas Account**
   - Visit: https://cloud.mongodb.com/
   - Sign up for free account
   - Create new cluster (M0 Sandbox - Free tier)
   - Wait for cluster deployment (2-3 minutes)

2. **Get Connection String**
   - Click "Connect" on your cluster
   - Choose "Connect your application"
   - Copy the connection string (looks like):
     ```
     mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/fanreward?retryWrites=true&w=majority
     ```
   - Replace `<password>` with your actual password

3. **Configure Network Access**
   - Go to "Network Access" in Atlas
   - Add IP Address: `0.0.0.0/0` (allows all IPs - for development only)

---

## 🔐 TASK 2: OAUTH API CREDENTIALS

### 2A: Spotify for Developers
1. **Create Spotify App**
   - Visit: https://developer.spotify.com/dashboard
   - Log in with Spotify account
   - Click "Create an App"
   - App Name: "FanReward Platform"
   - App Description: "Music fan engagement platform"
   - Website: `http://127.0.0.1:3000`
   - Redirect URI: `http://127.0.0.1:3000/api/auth/spotify/callback`

2. **Get Credentials**
   - Copy **Client ID**
   - Click "Show Client Secret" and copy **Client Secret**
   - Save these values for step 3

### 2B: Google Cloud Console (YouTube API)
1. **Create Google Cloud Project**
   - Visit: https://console.cloud.google.com/
   - Create new project: "fanreward-platform"
   - Select the project

2. **Enable YouTube API**
   - Go to "APIs & Services" > "Library"
   - Search "YouTube Data API v3"
   - Click "Enable"

3. **Create OAuth Credentials**
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client IDs"
   - Application type: "Web application"
   - Name: "FanReward Platform"
   - Authorized redirect URIs: `http://127.0.0.1:3000/api/auth/google/callback`
   - Click "Create"

4. **Get Credentials**
   - Copy **Client ID**
   - Copy **Client Secret**
   - Save these values for step 3

### 2C: Facebook for Developers (Instagram API)
1. **Create Facebook App**
   - Visit: https://developers.facebook.com/
   - Create account/login
   - Click "Create App" > "Business" > "Continue"
   - App Name: "FanReward Platform"
   - Contact Email: Your email

2. **Add Instagram Basic Display**
   - In app dashboard, click "Add Product"
   - Find "Instagram Basic Display" > "Set Up"
   - Create new Instagram App ID

3. **Configure App**
   - Go to Instagram Basic Display > Basic Display
   - OAuth Redirect URIs: `http://127.0.0.1:3000/api/auth/facebook/callback`
   - Deauthorize Callback URL: `http://127.0.0.1:3000/api/auth/facebook/deauth`
   - Data Deletion Request URL: `http://127.0.0.1:3000/api/auth/facebook/delete`

4. **Get Credentials**
   - Copy **App ID** (this is your Client ID)
   - Copy **App Secret** (this is your Client Secret)
   - Save these values for step 3

---

## ⚙️ TASK 3: ENVIRONMENT CONFIGURATION

1. **Open the `.env` file** in the project root directory
2. **Update these values** with your actual credentials:

```bash
# Replace with your MongoDB connection
MONGODB_URI=mongodb://127.0.0.1:27017/fanreward
# OR for Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/fanreward?retryWrites=true&w=majority

# Replace with your actual Spotify credentials
SPOTIFY_CLIENT_ID=your_actual_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_actual_spotify_client_secret_here

# Replace with your actual Google credentials  
GOOGLE_CLIENT_ID=your_actual_google_client_id_here
GOOGLE_CLIENT_SECRET=your_actual_google_client_secret_here

# Replace with your actual Facebook credentials
FACEBOOK_APP_ID=your_actual_facebook_app_id_here
FACEBOOK_APP_SECRET=your_actual_facebook_app_secret_here

# Generate new random strings for these (32+ characters each)
JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_random
REFRESH_TOKEN_SECRET=your_super_secret_refresh_key_here_also_make_it_long_and_random
```

3. **Generate JWT Secrets**
   - Use a password generator to create 32+ character random strings
   - Or run this in terminal: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - Do this twice for both JWT_SECRET and REFRESH_TOKEN_SECRET

---

## 📦 TASK 4: INSTALL DEPENDENCIES

1. **Open terminal/command prompt**
2. **Navigate to project folder:**
   ```bash
   cd "C:\Local Paid Attention Project\Paid Attention Development\fanreward-platform"
   ```
3. **Install Node.js dependencies:**
   ```bash
   npm install
   ```

---

## ✅ TASK 5: INITIAL TESTING

1. **Start the development server:**
   ```bash
   npm run dev
   ```

2. **Seed the database with test data:**
   ```bash
   node backend/scripts/seedData.js
   ```

3. **Test the setup:**
   - Open browser to: `http://127.0.0.1:3000`
   - Check health endpoint: `http://127.0.0.1:3000/api/health`
   - Admin dashboard: `http://127.0.0.1:3000/admin/`

---

## 🆘 TROUBLESHOOTING

### If MongoDB connection fails:
- Check if MongoDB service is running (Windows Services)
- Verify MONGODB_URI format in .env file
- For Atlas: check network access settings

### If OAuth login fails:
- Verify redirect URIs match exactly (use 127.0.0.1, not localhost)
- Check client IDs/secrets are correctly copied
- Ensure APIs are enabled (especially YouTube Data API)

### If npm install fails:
- Make sure you have Node.js 18+ installed
- Try deleting node_modules folder and run `npm install` again
- Check for space in folder path (can cause issues)

---

## 📞 NEED HELP?

If you encounter issues:
1. Check the error messages carefully
2. Verify all credentials are correctly copied (no extra spaces)
3. Make sure MongoDB is running
4. Check that all redirect URIs use `http://127.0.0.1:3000` (not localhost)

Once these tasks are complete, you'll have a fully functional FanReward Platform ready for testing!