import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import slices
import authSlice from '../slices/authSlice';
import appSlice from '../slices/appSlice';
import toolsSlice from '../slices/toolsSlice';
import chemicalsSlice from '../slices/chemicalsSlice';
import syncSlice from '../slices/syncSlice';

// Persist configuration
const persistConfig = {
  key: 'root',
  storage: AsyncStorage,
  whitelist: ['auth', 'app', 'sync'], // Persist auth, app, and sync state
};

// Root reducer
const rootReducer = combineReducers({
  auth: authSlice,
  app: appSlice,
  tools: toolsSlice,
  chemicals: chemicalsSlice,
  sync: syncSlice,
});

// Persisted reducer
const persistedReducer = persistReducer(persistConfig, rootReducer);

// Configure store
export const store = configureStore({
  reducer: persistedReducer,
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }),
  devTools: __DEV__,
});

// Persistor
export const persistor = persistStore(store);

// Types
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
