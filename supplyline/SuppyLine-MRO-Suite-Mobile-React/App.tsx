import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { Alert } from 'react-native';
import { store, persistor } from './src/store';
import AppNavigator from './src/navigation/AppNavigator';
import LoadingScreen from './src/screens/LoadingScreen';
import databaseInitService from './src/services/databaseInitService';

function AppContent() {
  const [isDbReady, setIsDbReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('Starting app initialization...');
        const result = await databaseInitService.initialize();

        if (result.success) {
          console.log('App initialized successfully');
          setIsDbReady(true);

          if (result.pendingOperations > 0) {
            console.log(`Found ${result.pendingOperations} pending operations`);
          }
        } else {
          console.error('App initialization failed:', result.error);
          setInitError(result.error || 'Unknown initialization error');

          Alert.alert(
            'Initialization Error',
            'Failed to initialize the app database. Some features may not work properly.',
            [
              {
                text: 'Retry',
                onPress: () => {
                  setInitError(null);
                  setIsDbReady(false);
                  initializeApp();
                }
              },
              {
                text: 'Continue Anyway',
                onPress: () => setIsDbReady(true)
              }
            ]
          );
        }
      } catch (error) {
        console.error('Unexpected initialization error:', error);
        setInitError(error instanceof Error ? error.message : 'Unexpected error');
      }
    };

    initializeApp();

    // Cleanup on unmount
    return () => {
      databaseInitService.cleanup();
    };
  }, []);

  if (!isDbReady && !initError) {
    return <LoadingScreen />;
  }

  return (
    <>
      <AppNavigator />
      <StatusBar style="auto" />
    </>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <PersistGate loading={<LoadingScreen />} persistor={persistor}>
        <AppContent />
      </PersistGate>
    </Provider>
  );
}
