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

// `@supabase/supabase-js` has an OPTIONAL dependency on `@opentelemetry/api` for tracing. Node and
// bundlers with `optionalDependencies` support skip it; Metro does not — it walks every import it
// finds and fails the whole bundle on a package that was never installed.
//
// Stubbed rather than installed, because installing it would ship a tracing SDK we do not use into
// the app bundle to satisfy an import that is only ever reached when tracing is configured.
const stub = path.resolve(projectRoot, 'lib/emptyModule.js');
const OPTIONAL_ABSENT = new Set(['@opentelemetry/api']);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (OPTIONAL_ABSENT.has(moduleName)) {
    return { type: 'sourceFile', filePath: stub };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
