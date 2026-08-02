// Metro must watch the workspace root so `@cvip/types` and `@cvip/ui` resolve from the
// node_modules hoisted by npm workspaces (AD-01).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

// expo-router discovers the app directory through this variable. In a workspace the Expo CLI
// does not always infer it, so it is set explicitly rather than left to resolution order.
process.env.EXPO_ROUTER_APP_ROOT = path.resolve(projectRoot, 'app');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
