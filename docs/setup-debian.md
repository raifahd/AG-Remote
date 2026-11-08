# Debian 13 (KDE) Setup Guide for AG Remote

This guide details host setup on Debian 13 (KDE) for AG Remote.

## 1. Tailscale Setup

1. Install Tailscale:
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   ```
2. Start and authenticate with your account:
   ```bash
   sudo tailscale up --operator=$USER --hostname=laptop-deb
   ```
3. Verify your assigned Tailscale IP address:
   ```bash
   tailscale ip -4
   ```
   The address should be in the `100.64.0.0/10` CGNAT block.

## 2. Firewall Configuration (UFW)

The AG Remote Bridge listens on port 48123 and binds strictly to the Tailscale interface (`tailscale0`).

If UFW is active, allow incoming traffic on `tailscale0` only:
```bash
sudo ufw allow in on tailscale0 to any port 48123 proto tcp comment 'AG Remote Bridge over Tailscale'
sudo ufw reload
```

## 3. Keep-Awake / Power Settings

To ensure Antigravity remains reachable while tasks are running:
- **KDE System Settings**: Go to *Power Management* -> *Energy Saving*. Set "When laptop lid is closed" to "Turn off screen" (do not suspend).
- **Temporary Keep-Awake via Terminal**:
  ```bash
  systemd-inhibit --what=idle:sleep:handle-lid-switch --who="AG Remote" --why="Background agent run" bash
  ```

## 4. Antigravity Launch Helper with Remote Debugging

Antigravity must be launched with `--remote-debugging-port=9222` to enable CDP fallback.

Run the launcher once to configure your user `.desktop` override:
```bash
./scripts/launch-antigravity.sh
```

This writes `~/.local/share/applications/antigravity.desktop`, allowing you to launch Antigravity from the KDE Application Launcher with remote debugging enabled.

