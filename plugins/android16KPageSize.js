const { withGradleProperties } = require('@expo/config-plugins');

module.exports = function withAndroid16KPageSize(config) {
  return withGradleProperties(config, (config) => {
    const existing = config.modResults.find(
      (item) => item.key === 'android.experimental.enable16KPageAlignment'
    );
    if (!existing) {
      config.modResults.push({
        type: 'property',
        key: 'android.experimental.enable16KPageAlignment',
        value: 'true',
      });
    }
    return config;
  });
};
