# Deploy Togglely on Coolify

This guide explains how to deploy Togglely on [Coolify](https://coolify.io/) - an open-source & self-hostable Heroku/Netlify alternative.

## Quick Start

### Option 1: Using Docker Compose (Recommended)

1. **Create a new resource** in Coolify
2. **Select "Docker Compose"** as the source
3. **Choose your Git repository** containing Togglely
4. **Select the `docker-compose.coolify.yml` file**

### Option 2: Using Single Dockerfile

1. **Create a new resource** in Coolify
2. **Select "Dockerfile"** as the source
3. **Choose your Git repository**
4. **Set the Dockerfile path to:** `/Dockerfile`

## Environment Variables

Configure these in Coolify UI:

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `NODE_ENV` | `production` | No | Node environment |
| `JWT_SECRET` | - | **Yes** | Secret for JWT tokens |
| `DATABASE_URL` | `mongodb://mongodb:27017/togglely?replicaSet=rs0` | No | MongoDB connection |
| `REDIS_URL` | `redis://redis:6379` | No | Redis connection |
| `BACKEND_PORT` | `4000` | No | Backend API port |
| `FRONTEND_PORT` | `3000` | No | Frontend web port |
| `MONGODB_PORT` | `27017` | No | MongoDB port |
| `REDIS_PORT` | `6379` | No | Redis port |
| `CORS_ORIGIN` | `*` | No | Allowed CORS origins |
| `VITE_API_URL` | `http://backend:4000` | No | API URL for frontend |

### Generate JWT_SECRET

```bash
openssl rand -base64 32
```

## Ports

The following ports need to be exposed:

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 3000 | Web UI |
| Backend | 4000 | API |

## Volumes (Persistent Storage)

Make sure to configure these volumes in Coolify:

| Volume | Path | Description |
|--------|------|-------------|
| `mongodb_data` | `/data/db` | MongoDB database |
| `redis_data` | `/data` | Redis cache |
| `uploads` | `/app/uploads` | File uploads |

## Health Checks

- **Backend**: `GET /health` on port 4000
- **Frontend**: `GET /` on port 3000

## Post-Deployment

After deployment, access your Togglely instance at:
- **Frontend**: `https://your-domain.com`
- **Backend API**: `https://your-domain.com/api`

### Default Login

The first user can be created by registering through the UI or using the demo account:
- Email: `demo@togglely.io`
- Password: `demo1234`

## Troubleshooting

### MongoDB Replica Set

MongoDB requires a replica set. This is automatically configured in the Docker Compose via the healthcheck.

### Redis Connection

If you see Redis connection errors, ensure the Redis service is running before the backend starts.

### CORS Issues

If you get CORS errors, update the `CORS_ORIGIN` environment variable to match your domain:
```
CORS_ORIGIN=https://your-domain.com
```

## Updates

To update Togglely:
1. Pull the latest changes from Git
2. Coolify will automatically rebuild and redeploy

## Support

For issues and feature requests, visit: https://github.com/yourusername/togglely/issues
