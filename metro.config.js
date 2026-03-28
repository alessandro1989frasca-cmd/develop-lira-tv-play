const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.server = {
  ...config.server,
  dangerouslyDisableHostCheck: true,
};

module.exports = config;
