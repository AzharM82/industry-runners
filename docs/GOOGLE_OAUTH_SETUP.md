# Google OAuth Setup for StockPro AI

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click the project dropdown (top left) → **New Project**
3. Name it: `StockPro AI`
4. Click **Create**

## Step 2: Configure OAuth Consent Screen

1. In the sidebar: **APIs & Services** → **OAuth consent screen**
2. Select **External** → Click **Create**
3. Fill in:
   - App name: `StockPro AI`
   - User support email: `reachazure37@gmail.com`
   - Developer contact: `reachazure37@gmail.com`
4. Click **Save and Continue**
5. Scopes: Click **Save and Continue** (defaults are fine)
6. Test users: Click **Save and Continue**
7. Click **Back to Dashboard**

## Step 3: Create OAuth Credentials

1. In sidebar: **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `StockPro AI Web`
5. **Authorized JavaScript origins:**
   ```
   https://agreeable-flower-06913690f.1.azurestaticapps.net
   https://www.stockproai.net
   ```
6. **Authorized redirect URIs:**
   ```
   https://agreeable-flower-06913690f.1.azurestaticapps.net/.auth/login/google/callback
   https://www.stockproai.net/.auth/login/google/callback
   ```
7. Click **Create**
8. **Copy the Client ID and Client Secret** - you'll need these!

## Step 4: Add to Azure (Claude will do this for you)

Once you have the Client ID and Client Secret, provide them and Claude will run:

```bash
az staticwebapp appsettings set \
  --name industry-runners \
  --resource-group industry-runners-rg \
  --setting-names \
    "GOOGLE_CLIENT_ID=your-client-id" \
    "GOOGLE_CLIENT_SECRET=your-client-secret"
```

## Step 5: Publish App (Optional for Production)

For more than 100 users, you'll need to:
1. Go to OAuth consent screen
2. Click **Publish App**
3. Complete Google's verification process
