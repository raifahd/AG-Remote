const { BridgeServer } = require("../packages/bridge/dist/server.js");
const { SdkAdapter } = require("../packages/bridge/dist/adapters/SdkAdapter.js");
const { AgentStateMachine } = require("../packages/bridge/dist/stateMachine.js");
const { TokenManager, FileSecretStore } = require("../packages/bridge/dist/auth.js");
const { NtfyNotifier } = require("../packages/bridge/dist/notifier.js");
const { findTailscaleIpv4 } = require("../packages/bridge/dist/network.js");
const path = require("path");
const os = require("os");

async function main() {
  const tailscaleIp = findTailscaleIpv4();
  if (!tailscaleIp) {
    console.error("Error: Tailscale IPv4 address not found.");
    process.exit(1);
  }

  const store = new FileSecretStore(path.join(os.homedir(), ".ag-remote-token"));
  const tokenManager = new TokenManager(store);
  const token = await tokenManager.getOrCreateToken();

  const notifier = new NtfyNotifier(store, {
    tailscaleIp,
    hostLabel: os.hostname()
  });
  const topic = await notifier.getOrCreateTopic();

  const stateMachine = new AgentStateMachine({ debounceMs: 2000 });
  const adapter = new SdkAdapter(stateMachine);
  adapter.startPolling();

  const server = new BridgeServer(
    {
      port: 48123,
      host: tailscaleIp,
      version: "0.1.0",
      adapterMode: "sdk"
    },
    adapter,
    tokenManager,
    undefined,
    notifier
  );

  await server.start();
  console.log("-----------------------------------------------------------------");
  console.log("AG Remote Bridge is RUNNING!");
  console.log(`Open on Phone: http://${tailscaleIp}:48123/app?token=${token}`);
  console.log(`ntfy Topic:    ${topic}`);
  console.log("-----------------------------------------------------------------");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

