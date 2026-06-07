const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Block LangChain packages from Metro's file watcher.
// LangChain is server-only; its pnpm install creates short-lived _tmp_ dirs
// that Metro's FallbackWatcher crashes on with ENOENT.
const blockList = config.resolver.blockList
  ? [].concat(config.resolver.blockList)
  : [];

blockList.push(/@langchain[\\/]/);
blockList.push(/langchain[\\/]/);

config.resolver.blockList = blockList;

module.exports = config;
