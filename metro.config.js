const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.server = {
  ...config.server,
  dangerouslyDisableHostCheck: true,
};

/* Polyfill per moduli Node.js usati da react-native-svg >= 15.x */
config.resolver = {
  ...config.resolver,
  extraNodeModules: {
    ...config.resolver?.extraNodeModules,
    buffer: require.resolve("buffer"),
  },
};

module.exports = config;
