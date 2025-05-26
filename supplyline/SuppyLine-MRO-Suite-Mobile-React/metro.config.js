const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Add platform-specific extensions
config.resolver.platforms = ['web', 'ios', 'android', 'native'];

// Add platform-specific file extensions
config.resolver.sourceExts = [...config.resolver.sourceExts, 'web.ts', 'web.tsx'];

// Configure resolver to handle platform-specific imports
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

// Custom resolver to handle platform-specific modules
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Replace expo-sqlite with mock for web platform
  if (moduleName === 'expo-sqlite' && platform === 'web') {
    return {
      filePath: path.resolve(__dirname, 'src/database/MockSQLite.ts'),
      type: 'sourceFile',
    };
  }

  // Use default resolver for other cases
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
