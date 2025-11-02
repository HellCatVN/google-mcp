# Google MCP Server Deployment Guide

This guide covers different ways to deploy the Google MCP server on Linux servers.

## Option 1: systemd (Recommended for Production)

**Best for**: Production Linux servers, reliability, system integration

### Setup:

1. **Copy the service file:**
   ```bash
   sudo cp google-mcp.service /etc/systemd/system/
   ```

2. **Edit the service file** (update paths, user, etc.):
   ```bash
   sudo nano /etc/systemd/system/google-mcp.service
   ```

3. **Reload systemd and start:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable google-mcp  # Start on boot
   sudo systemctl start google-mcp   # Start now
   ```

4. **Check status:**
   ```bash
   sudo systemctl status google-mcp
   sudo journalctl -u google-mcp -f  # View logs
   ```

**Advantages:**
- ✅ Native Linux integration
- ✅ Automatic restart on failure
- ✅ Proper logging via journald
- ✅ Handles environment variables correctly
- ✅ Start on boot
- ✅ No stdin piping issues

---

## Option 2: Docker (Recommended for Containerized Deployments)

**Best for**: Containerized environments, isolation, portability

### Setup:

1. **Build and run:**
   ```bash
   docker-compose up -d
   ```

2. **View logs:**
   ```bash
   docker-compose logs -f google-mcp
   ```

3. **Stop:**
   ```bash
   docker-compose down
   ```

**Advantages:**
- ✅ Complete isolation
- ✅ Easy to scale
- ✅ Consistent environment
- ✅ Works on any OS with Docker
- ✅ No stdin piping issues

---

## Option 3: supervisord

**Best for**: Simpler alternative to systemd, Python-based

### Setup:

1. **Install supervisord:**
   ```bash
   sudo apt-get install supervisor  # Debian/Ubuntu
   # or
   sudo yum install supervisor       # RHEL/CentOS
   ```

2. **Copy config:**
   ```bash
   sudo cp supervisord.conf /etc/supervisor/conf.d/google-mcp.conf
   ```

3. **Create log directory:**
   ```bash
   sudo mkdir -p /var/log/google-mcp
   sudo chown hellcatvn:hellcatvn /var/log/google-mcp
   ```

4. **Start:**
   ```bash
   sudo supervisorctl reread
   sudo supervisorctl update
   sudo supervisorctl start google-mcp
   ```

5. **View logs:**
   ```bash
   tail -f /var/log/google-mcp/out.log
   ```

**Advantages:**
- ✅ Simple configuration
- ✅ Web UI available (optional)
- ✅ Good for multiple services
- ✅ Reliable restarts

---

## Comparison

| Feature | systemd | Docker | supervisord | PM2 |
|---------|---------|--------|-------------|-----|
| **Ease of Setup** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Production Ready** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **OS Integration** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Resource Usage** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Stdin Handling** | ✅ Perfect | ✅ Perfect | ✅ Perfect | ⚠️ Issues |
| **Best For** | Production servers | Containers | Multiple services | Development |

---

## Migration from PM2

If you're currently using PM2:

1. **Stop PM2 process:**
   ```bash
   pm2 stop gmcp
   pm2 delete gmcp
   ```

2. **Choose one of the options above** (systemd recommended)

3. **Verify it's working:**
   ```bash
   # For systemd:
   sudo systemctl status google-mcp
   
   # Check logs match your previous PM2 logs
   ```

---

## Environment Variables

All deployment methods support loading from `.env` file. Make sure your `.env` file has:
- `MCP_ENDPOINT` (if using bridge mode)
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_TOKEN_PATH`
- Other required variables

---

## Troubleshooting

### systemd issues:
- Check logs: `sudo journalctl -u google-mcp -n 50`
- Verify paths in service file
- Check permissions on `.env` file

### Docker issues:
- Check logs: `docker-compose logs google-mcp`
- Verify `.env` file is mounted/accessible
- Check Docker network connectivity

### supervisord issues:
- Check logs in `/var/log/google-mcp/`
- Verify config: `sudo supervisorctl status google-mcp`
- Check permissions on directories

