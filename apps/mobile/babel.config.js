const path = require('path');

// The Babel transform runs in a separate worker process, so EXPO_ROUTER_APP_ROOT must be set
// here as well as in metro.config.js — expo-router's require.context is inlined at transform
// time and cannot see a variable set only in the Metro parent process. Needed because npm
// workspaces (AD-01) stop the Expo CLI inferring the app directory on its own.
process.env.EXPO_ROUTER_APP_ROOT ??= path.resolve(__dirname, 'app');

module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
