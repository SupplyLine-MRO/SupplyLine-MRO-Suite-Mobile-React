import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface AppState {
  isOnline: boolean;
  isLoading: boolean;
  lastSyncTime: string | null;
  syncInProgress: boolean;
  theme: 'light' | 'dark';
  notifications: {
    enabled: boolean;
    sound: boolean;
    vibration: boolean;
  };
}

const initialState: AppState = {
  isOnline: true,
  isLoading: false,
  lastSyncTime: null,
  syncInProgress: false,
  theme: 'light',
  notifications: {
    enabled: true,
    sound: true,
    vibration: true,
  },
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setOnlineStatus: (state, action: PayloadAction<boolean>) => {
      state.isOnline = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setSyncInProgress: (state, action: PayloadAction<boolean>) => {
      state.syncInProgress = action.payload;
    },
    setLastSyncTime: (state, action: PayloadAction<string>) => {
      state.lastSyncTime = action.payload;
    },
    setTheme: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.theme = action.payload;
    },
    updateNotificationSettings: (
      state,
      action: PayloadAction<Partial<AppState['notifications']>>
    ) => {
      state.notifications = { ...state.notifications, ...action.payload };
    },
  },
});

export const {
  setOnlineStatus,
  setLoading,
  setSyncInProgress,
  setLastSyncTime,
  setTheme,
  updateNotificationSettings,
} = appSlice.actions;

export default appSlice.reducer;
