# VibeCoder - Setup & Deployment Guide

A step-by-step guide to get VibeCoder running on your server. No coding experience required.

---

## What You Need Before Starting

1. **A server** (VPS) — any Linux server works. Recommended providers:
   - [Hetzner](https://hetzner.com) (cheapest, EU/US)
   - [DigitalOcean](https://digitalocean.com)
   - [AWS Lightsail](https://aws.amazon.com/lightsail/)
   - Minimum: 1 CPU, 1 GB RAM, 10 GB disk

2. **A domain name** — e.g., `chat.yourdomain.com`
   - Point it to your server's IP address (A record in your DNS settings)

3. **An OpenRouter API key** — sign up at [openrouter.ai](https://openrouter.ai) and get your API key
   - This gives you access to 300+ AI models (GPT, Claude, Gemini, etc.)
   - You pay per usage — typical cost is $1-5/month for personal use

---

## Option A: Deploy with Docker (Recommended)

This is the easiest method. Docker handles everything automatically.

### Step 1: Install Docker on Your Server

Connect to your server via SSH:

```bash
ssh root@your-server-ip
```

Install Docker:

```bash
# Update system packages
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Verify Docker is installed
docker --version
```

You should see something like `Docker version 27.x.x`.

### Step 2: Download VibeCoder

```bash
# Create a directory for VibeCoder
mkdir -p /opt/vibecoder
cd /opt/vibecoder

# Download the project files (replace with your actual repo URL)
git clone <your-repo-url> .
```

If you don't have git, install it first: `apt install git -y`

### Step 3: Configure Your Settings

Create your environment file:

```bash
cp .env.example .env
```

Now edit the file:

```bash
nano .env
```

Fill in these values:

```
DATABASE_URL="file:/app/data/vibecoder.db"
JWT_SECRET="paste-a-random-secret-here"
NEXT_PUBLIC_APP_NAME="VibeCoder"
```

**Generate a secure JWT secret** (copy and paste this command):

```bash
openssl rand -base64 32
```

Copy the output and paste it as your `JWT_SECRET` value.

Save the file: press `Ctrl+X`, then `Y`, then `Enter`.

### Step 4: Configure Your Domain

Edit the docker-compose file:

```bash
nano docker-compose.yml
```

You can set these in your `.env` file instead of editing docker-compose.yml directly:

```
DOMAIN=chat.yourdomain.com
ACME_EMAIL=your-email@example.com
JWT_SECRET=your-generated-secret
```

- `DOMAIN` — your domain name (e.g., `chat.yourdomain.com`)
- `ACME_EMAIL` — your email for SSL certificate notifications
- `JWT_SECRET` — the secret you generated in Step 3

Save the file: press `Ctrl+X`, then `Y`, then `Enter`.

### Step 5: Create the Traefik Network

This is needed for the reverse proxy to work:

```bash
docker network create traefik-net
```

### Step 6: Build and Start VibeCoder

```bash
docker compose up -d --build
```

This will:
- Build the application (takes 2-5 minutes the first time)
- Start the app, Redis, and Traefik (reverse proxy + SSL)
- Automatically get an SSL certificate for your domain

Check if everything is running:

```bash
docker compose ps
```

You should see 3 containers running: `vibecoder`, `vibecoder-redis`, `vibecoder-traefik`.

Check logs if something goes wrong:

```bash
docker compose logs -f app
```

### Step 7: Initial Setup

1. Open your browser and go to `https://chat.yourdomain.com/setup`
2. You'll see the setup wizard:
   - **Step 1**: Create your admin account
     - Enter your name
     - Enter your email
     - Choose a strong password (minimum 8 characters)
   - **Step 2**: Connect OpenRouter
     - Paste your OpenRouter API key (starts with `sk-or-v1-...`)
3. Click "Complete Setup"
4. You'll be redirected to the chat — you're ready to go!

### Step 8: Verify Everything Works

1. **Send a test message** in Classic Chat mode — you should get a response within seconds
2. **Check the sidebar** — your name and credit balance should appear
3. **Try Multimodel Chat** — click "New Chat" > "Multimodel" > send a message
4. **Check Settings** (gear icon) — verify your models and preferences

---

## Option B: Deploy Without Docker (Manual)

If you prefer not to use Docker, or your server doesn't support it.

### Step 1: Install Node.js

```bash
# Install Node.js 22 (required)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# Verify installation
node --version    # Should show v22.x.x
npm --version     # Should show 10.x.x
```

### Step 2: Download and Install VibeCoder

```bash
# Create app directory
mkdir -p /opt/vibecoder
cd /opt/vibecoder

# Download the project
git clone <your-repo-url> .

# Install dependencies
npm install
```

### Step 3: Configure Environment

```bash
cp .env.example .env
nano .env
```

Set these values:

```
DATABASE_URL="file:./data/vibecoder.db"
JWT_SECRET="paste-your-secret-here"
NEXT_PUBLIC_APP_NAME="VibeCoder"
```

Generate your JWT secret:

```bash
openssl rand -base64 32
```

### Step 4: Set Up the Database

```bash
# Create data directory
mkdir -p data

# Push the database schema (creates tables)
npm run db:push
```

### Step 5: Build the Application

```bash
npm run build
```

This compiles the app for production. Takes 1-3 minutes.

### Step 6: Start the Application

```bash
# Start in production mode
NODE_ENV=production npm run start
```

The app is now running at `http://your-server-ip:3000`.

### Step 7: Keep It Running (Process Manager)

Install PM2 to keep the app running after you close your SSH session:

```bash
# Install PM2 globally
npm install -g pm2

# Start VibeCoder with PM2
pm2 start npm --name "vibecoder" -- start

# Make it start on server reboot
pm2 startup
pm2 save
```

Useful PM2 commands:

```bash
pm2 status              # Check if app is running
pm2 logs vibecoder      # View logs
pm2 restart vibecoder   # Restart the app
pm2 stop vibecoder      # Stop the app
```

### Step 8: Set Up SSL with Nginx (Optional but Recommended)

Install Nginx and Certbot:

```bash
apt install nginx certbot python3-certbot-nginx -y
```

Create Nginx config:

```bash
nano /etc/nginx/sites-available/vibecoder
```

Paste this (replace `chat.yourdomain.com` with your actual domain):

```nginx
server {
    listen 80;
    server_name chat.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site and get SSL:

```bash
# Enable the site
ln -s /etc/nginx/sites-available/vibecoder /etc/nginx/sites-enabled/

# Test config
nginx -t

# Restart Nginx
systemctl restart nginx

# Get free SSL certificate
certbot --nginx -d chat.yourdomain.com
```

Follow the prompts — Certbot will automatically configure HTTPS.

### Step 9: Initial Setup

Same as Docker method, Step 7 — go to `https://chat.yourdomain.com/setup` in your browser.

---

## After Setup: First Things to Do

### 1. Add Credits to Your Account

By default, the admin account starts with some credits from the seed. To add more:
- Go to **Settings** (gear icon in sidebar)
- Navigate to **Members** tab
- Click your user and adjust the credit balance

### 2. Configure AI Models

- Go to **Settings** > **Models** tab
- Choose your **Maestro model** (the premium model used for quality judgment) — default is Claude Opus 4.6
- Enable/disable models based on your preference and budget
- Cheaper models = lower cost per message, premium models = higher quality

### 3. Create Skills (Optional)

- Click **Skills** in the top bar
- Create custom skills (system prompts) like "React Expert", "Writing Coach", etc.
- These can be used in Skilled Chat mode

### 4. Invite Team Members (Optional)

- Go to **Settings** > **Members**
- Add team members with email/password
- Set their role (admin or member) and monthly credit limit

---

## Updating VibeCoder

### Docker Update

```bash
cd /opt/vibecoder

# Pull latest changes
git pull

# Rebuild and restart
docker compose up -d --build
```

### Manual Update

```bash
cd /opt/vibecoder

# Pull latest changes
git pull

# Install any new dependencies
npm install

# Push any database changes
npm run db:push

# Rebuild
npm run build

# Restart
pm2 restart vibecoder
```

---

## Troubleshooting

### "Cannot connect" or blank page

- Check if the app is running: `docker compose ps` or `pm2 status`
- Check logs: `docker compose logs -f app` or `pm2 logs vibecoder`
- Make sure port 3000 is open: `ufw allow 3000` (if using UFW firewall)

### "JWT_SECRET environment variable is required"

- Make sure your `.env` file has a `JWT_SECRET` value set
- Generate one: `openssl rand -base64 32`

### "Failed to collect page data" during build

- This means an environment variable is missing at build time
- For Docker: the Dockerfile sets `DATABASE_URL` during build, so this should work
- For manual: make sure `.env` exists before running `npm run build`

### SSL certificate not working

- Make sure your domain's DNS A record points to your server IP
- Wait a few minutes after changing DNS (propagation takes time)
- Check Traefik logs: `docker compose logs traefik`
- Or run Certbot again: `certbot --nginx -d chat.yourdomain.com`

### Chat not responding / AI errors

- Verify your OpenRouter API key is correct and has credit
- Check at [openrouter.ai/activity](https://openrouter.ai/activity) if requests are going through
- Check app logs for error details

### Database errors

- Docker: `docker compose exec app npx prisma db push`
- Manual: `npm run db:push`

---

## Server Requirements Summary

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| CPU | 1 core | 2 cores |
| RAM | 1 GB | 2 GB |
| Disk | 10 GB | 20 GB |
| OS | Ubuntu 22.04+ | Ubuntu 24.04 |
| Node.js | 22+ | 22 LTS |
| Docker | 24+ | Latest |

---

## Quick Reference

| Action | Command |
|--------|---------|
| Start (Docker) | `docker compose up -d` |
| Stop (Docker) | `docker compose down` |
| View logs (Docker) | `docker compose logs -f app` |
| Rebuild (Docker) | `docker compose up -d --build` |
| Start (PM2) | `pm2 start vibecoder` |
| Stop (PM2) | `pm2 stop vibecoder` |
| View logs (PM2) | `pm2 logs vibecoder` |
| Restart (PM2) | `pm2 restart vibecoder` |
| Database push | `npm run db:push` |
| Generate JWT secret | `openssl rand -base64 32` |
