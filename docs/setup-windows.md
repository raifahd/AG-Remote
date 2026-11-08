# Windows Setup Guide for AG Remote

This guide details host setup on Windows for AG Remote.

## 1. Tailscale Setup

1. Download and install Tailscale for Windows from [tailscale.com](https://tailscale.com/download).
2. Authenticate Tailscale and set device name to `laptop-win`.
3. Verify your assigned Tailscale IP address via PowerShell:
   ```powershell
   tailscale ip -4
   ```

## 2. Windows Firewall Configuration

The AG Remote Bridge binds exclusively to the Tailscale IPv4 address on port 48123.

In an elevated PowerShell prompt (Run as Administrator), add a firewall rule scoped to the Tailscale interface:
```powershell
New-NetFirewallRule -DisplayName "AG Remote Bridge (Tailscale)" -Direction Inbound -LocalPort 48123 -Protocol TCP -Action Allow -InterfaceAlias "Tailscale"
```

## 3. Keep-Awake / Power Settings

To keep the machine awake while connected to AC power during long agent runs:
```powershell
powercfg -change -standby-timeout-ac 0
powercfg -change -monitor-timeout-ac 10
```

## 4. Antigravity Launch Helper with Remote Debugging

Launch Antigravity with the remote debugging port enabled using the provided helper:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\launch-antigravity.ps1
```

You can create a desktop shortcut targeting this command for convenient startup.

