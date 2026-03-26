const { getDefaultConfig } = require("expo/metro-config");
const { withRorkMetro } = require("@rork-ai/toolkit-sdk/metro");

const config = getDefaultConfig(__dirname);

const rorkConfig = withRorkMetro(config);

rorkConfig.server = {
  ...rorkConfig.server,
  dangerouslyDisableHostCheck: true,
};

module.exports = rorkConfig;
