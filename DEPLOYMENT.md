# Deployment Guide: Supabase + Vercel

This guide walks you through deploying the Petroleum Station Management System to Supabase (database) and Vercel (backend + frontend).

## Prerequisites

- GitHub account
- Supabase account (free tier available)
- Vercel account (free tier available)
- Cloudinary account (for receipt image uploads)

## Step 1: Set Up Supabase Database

### 1.1 Create Supabase Project

1. Go to [Supabase](https://supabase.com) and sign in
2. Click "New Project"
3. Fill in:
   - **Name**: petroleum-station-system (or your preferred name)
   - **Database Password**: Create a strong password (save this!)
   - **Region**: Choose closest to your users
4. Click "Create new project"
5. Wait for project to be created (2-3 minutes)

### 1.2 Get Database Connection Strings

1. In your Supabase project, go to **Settings** → **Database**
2. Find the **Connection string** section
3. Copy the following:
   - **Connection pooling** (Transaction mode) - Use this for `DATABASE_URL`
   - **Direct connection** - Use this for `DIRECT_URL` (migrations only)

The connection strings look like:
```
# Connection Pooling (for DATABASE_URL)
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true

# Direct Connection (for DIRECT_URL)
postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

### 1.3 Run Prisma Migrations

1. Clone your repository locally (if not already done)
2. Navigate to the backend directory:
   ```bash
   cd backend
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Create a `.env` file in the backend directory:
   ```env
   DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true"
   DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
   ```

5. Run migrations:
   ```bash
   npx prisma migrate deploy
   ```

   Or for development:
   ```bash
   npx prisma migrate dev --name init
   ```

6. Generate Prisma Client:
   ```bash
   npx prisma generate
   ```

7. (Optional) Verify database setup:
   ```bash
   npx prisma studio
   ```

## Step 2: Deploy Backend to Vercel

### 2.1 Prepare Backend for Deployment

1. Ensure your backend code is pushed to GitHub
2. The backend should have:
   - `vercel.json` configuration file
   - `api/index.ts` serverless entry point
   - Updated `package.json` with build scripts

### 2.2 Deploy to Vercel

1. Go to [Vercel](https://vercel.com) and sign in
2. Click "Add New Project"
3. Import your GitHub repository
4. Configure the project:
   - **Framework Preset**: Other
   - **Root Directory**: `backend` (if your backend is in a subdirectory)
   - **Build Command**: `npm run build`
   - **Output Directory**: Leave empty (not needed for serverless)
   - **Install Command**: `npm install`

5. **Add Environment Variables**:
   Click "Environment Variables" and add:

   ```
   DATABASE_URL = postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true
   DIRECT_URL = postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
   JWT_SECRET = [Generate a strong random string, min 32 characters]
   JWT_EXPIRES_IN = 7d
   NODE_ENV = production
   FRONTEND_URL = https://your-frontend-url.vercel.app (update after frontend deployment)
   CLOUDINARY_CLOUD_NAME = [Your Cloudinary cloud name]
   CLOUDINARY_API_KEY = [Your Cloudinary API key]
   CLOUDINARY_API_SECRET = [Your Cloudinary API secret]
   ```

6. Click "Deploy"
7. Wait for deployment to complete
8. Copy the deployment URL (e.g., `https://your-backend-name.vercel.app`)

### 2.3 Verify Backend Deployment

1. Test the health endpoint:
   ```
   https://your-backend-url.vercel.app/health
   ```

2. You should see:
   ```json
   {
     "status": "ok",
     "timestamp": "2024-..."
   }
   ```

## Step 3: Deploy Frontend to Vercel

### 3.1 Prepare Frontend for Deployment

1. Ensure your frontend code is pushed to GitHub
2. The frontend should have:
   - `vercel.json` configuration file
   - Updated `vite.config.ts`
   - Updated API service to use environment variables

### 3.2 Deploy to Vercel

1. In Vercel, click "Add New Project" again
2. Import the same GitHub repository
3. Configure the project:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend` (if your frontend is in a subdirectory)
   - **Build Command**: `npm run build` (auto-detected)
   - **Output Directory**: `dist` (auto-detected)
   - **Install Command**: `npm install`

4. **Add Environment Variables**:
   ```
   VITE_API_URL = https://your-backend-url.vercel.app
   ```

   ⚠️ **Important**: Replace `your-backend-url.vercel.app` with your actual backend URL from Step 2.

5. Click "Deploy"
6. Wait for deployment to complete
7. Copy the frontend URL (e.g., `https://your-frontend-name.vercel.app`)

### 3.3 Update Backend CORS

1. Go back to your backend project in Vercel
2. Go to **Settings** → **Environment Variables**
3. Update `FRONTEND_URL` with your actual frontend URL:
   ```
   FRONTEND_URL = https://your-frontend-url.vercel.app
   ```
4. Redeploy the backend (Vercel will auto-redeploy when env vars change)

## Step 4: Set Up Cloudinary (Optional but Recommended)

### 4.1 Create Cloudinary Account

1. Go to [Cloudinary](https://cloudinary.com) and sign up
2. After signup, you'll see your dashboard with:
   - Cloud name
   - API Key
   - API Secret

### 4.2 Add Cloudinary Credentials to Backend

1. In Vercel backend project, go to **Settings** → **Environment Variables**
2. Add:
   ```
   CLOUDINARY_CLOUD_NAME = [Your cloud name]
   CLOUDINARY_API_KEY = [Your API key]
   CLOUDINARY_API_SECRET = [Your API secret]
   ```
3. Redeploy backend

## Step 5: Create Initial Admin User

After deployment, you need to create an admin user. You have two options:

### Option A: Using Prisma Studio (Recommended)

1. Run Prisma Studio locally:
   ```bash
   cd backend
   npx prisma studio
   ```

2. Open the User model
3. Create a new user with:
   - Email: your-admin@email.com
   - Password: (hashed - use a tool or create via API)
   - Role: Admin
   - Name: Admin User

### Option B: Using API (After creating first user)

1. Use the register endpoint (requires authentication, so you'll need to create the first user via database)

### Option C: Create via Supabase Dashboard

1. Go to Supabase Dashboard → Table Editor
2. Open the `User` table
3. Insert a new row (you'll need to hash the password manually)

**Note**: For production, consider creating a seed script or using Supabase's SQL editor to create the first admin user.

## Step 6: Verify Deployment

### 6.1 Test Frontend

1. Visit your frontend URL
2. Try logging in (if you created a user)
3. Test all major features:
   - Cash flow entry
   - Inventory readings
   - User registration (admin only)

### 6.2 Test Backend Endpoints

Use a tool like Postman or curl to test:

```bash
# Health check
curl https://your-backend-url.vercel.app/health

# Login
curl -X POST https://your-backend-url.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}'
```

## Troubleshooting

### Database Connection Issues

- **Error**: "Can't reach database server"
  - Verify `DATABASE_URL` uses connection pooling format
  - Check Supabase project is active
  - Verify password is correct

- **Error**: "Migration failed"
  - Use `DIRECT_URL` for migrations, not `DATABASE_URL`
  - Run migrations locally first before deploying

### Vercel Deployment Issues

- **Error**: "Build failed"
  - Check build logs in Vercel dashboard
  - Ensure all dependencies are in `package.json`
  - Verify Node.js version compatibility

- **Error**: "Function timeout"
  - Vercel serverless functions have a 10s timeout on free tier
  - Optimize database queries
  - Consider upgrading to Pro plan for longer timeouts

### CORS Issues

- **Error**: "CORS policy blocked"
  - Verify `FRONTEND_URL` in backend environment variables
  - Check frontend is using correct `VITE_API_URL`
  - Ensure CORS middleware is configured correctly

### Prisma Issues

- **Error**: "Prisma Client not generated"
  - Add `postinstall` script: `"postinstall": "prisma generate"`
  - Ensure Prisma is in dependencies, not devDependencies for production

## Environment Variables Summary

### Backend (Vercel)
```
DATABASE_URL          # Supabase connection pooling URL
DIRECT_URL            # Supabase direct connection URL (for migrations)
JWT_SECRET            # Random string, min 32 characters
JWT_EXPIRES_IN        # Token expiration (e.g., "7d")
NODE_ENV              # "production"
FRONTEND_URL          # Your frontend Vercel URL
CLOUDINARY_CLOUD_NAME # Cloudinary cloud name
CLOUDINARY_API_KEY    # Cloudinary API key
CLOUDINARY_API_SECRET # Cloudinary API secret
```

### Frontend (Vercel)
```
VITE_API_URL          # Your backend Vercel URL
```

## Production Checklist

- [ ] Database migrations run successfully
- [ ] Backend deployed and health check passes
- [ ] Frontend deployed and loads correctly
- [ ] CORS configured correctly
- [ ] Environment variables set in Vercel
- [ ] Admin user created
- [ ] Cloudinary configured (for receipt uploads)
- [ ] Test all major workflows:
  - [ ] User login
  - [ ] Cash flow entry
  - [ ] Cash transfer workflow
  - [ ] Inventory readings
  - [ ] Tanker delivery
  - [ ] Receipt upload
- [ ] Monitor Vercel logs for errors
- [ ] Set up error tracking (optional: Sentry, LogRocket)

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [Prisma with Supabase](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-vercel)
- [Cloudinary Documentation](https://cloudinary.com/documentation)

## Support

If you encounter issues:
1. Check Vercel deployment logs
2. Check Supabase database logs
3. Verify all environment variables are set correctly
4. Test endpoints individually
5. Check browser console for frontend errors

