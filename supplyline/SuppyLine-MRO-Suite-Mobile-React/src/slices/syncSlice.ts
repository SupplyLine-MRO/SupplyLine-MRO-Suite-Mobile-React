/**
 * Sync Redux Slice
 * Manages synchronization state and conflict resolution
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import syncService, { SyncResult, SyncProgress, ConflictRecord } from '../services/syncService';

export interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: string | null;
  lastSyncResult: SyncResult | null;
  syncProgress: SyncProgress | null;
  conflicts: ConflictRecord[];
  pendingOperations: number;
  autoSyncEnabled: boolean;
  syncInterval: number; // minutes
  error: string | null;
}

const initialState: SyncState = {
  isOnline: true,
  isSyncing: false,
  lastSyncTime: null,
  lastSyncResult: null,
  syncProgress: null,
  conflicts: [],
  pendingOperations: 0,
  autoSyncEnabled: true,
  syncInterval: 15, // 15 minutes default
  error: null
};

// Async thunks
export const performFullSync = createAsyncThunk(
  'sync/performFullSync',
  async (_, { rejectWithValue, dispatch }) => {
    try {
      dispatch(setSyncInProgress(true));

      // Set up progress monitoring
      const unsubscribe = syncService.onSyncProgress((progress) => {
        dispatch(setSyncProgress(progress));
      });

      const result = await syncService.syncAll();

      unsubscribe();
      dispatch(setSyncProgress(null));

      return result;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Sync failed');
    } finally {
      dispatch(setSyncInProgress(false));
    }
  }
);

export const loadPendingConflicts = createAsyncThunk(
  'sync/loadPendingConflicts',
  async (_, { rejectWithValue }) => {
    try {
      const conflicts = await syncService.getPendingConflicts();
      return conflicts;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to load conflicts');
    }
  }
);

export const resolveConflict = createAsyncThunk(
  'sync/resolveConflict',
  async (
    {
      conflictId,
      resolution,
      mergedData
    }: {
      conflictId: string;
      resolution: 'local' | 'server' | 'merge';
      mergedData?: any
    },
    { rejectWithValue, dispatch }
  ) => {
    try {
      await syncService.resolveConflict(conflictId, resolution, mergedData);

      // Reload conflicts after resolution
      dispatch(loadPendingConflicts());

      return conflictId;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to resolve conflict');
    }
  }
);

export const checkNetworkStatus = createAsyncThunk(
  'sync/checkNetworkStatus',
  async (_, { rejectWithValue }) => {
    try {
      // Simple network check - try to fetch from server
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('/api/health', {
        method: 'HEAD',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      return false;
    }
  }
);

const syncSlice = createSlice({
  name: 'sync',
  initialState,
  reducers: {
    setOnlineStatus: (state, action: PayloadAction<boolean>) => {
      state.isOnline = action.payload;

      // If coming back online and auto-sync is enabled, trigger sync
      if (action.payload && state.autoSyncEnabled && !state.isSyncing) {
        // This would be handled by middleware or effect
      }
    },

    setSyncInProgress: (state, action: PayloadAction<boolean>) => {
      state.isSyncing = action.payload;
      if (!action.payload) {
        state.syncProgress = null;
      }
    },

    setSyncProgress: (state, action: PayloadAction<SyncProgress | null>) => {
      state.syncProgress = action.payload;
    },

    setLastSyncTime: (state, action: PayloadAction<string>) => {
      state.lastSyncTime = action.payload;
    },

    setPendingOperations: (state, action: PayloadAction<number>) => {
      state.pendingOperations = action.payload;
    },

    setAutoSyncEnabled: (state, action: PayloadAction<boolean>) => {
      state.autoSyncEnabled = action.payload;
    },

    setSyncInterval: (state, action: PayloadAction<number>) => {
      state.syncInterval = action.payload;
    },

    clearError: (state) => {
      state.error = null;
    },

    addConflict: (state, action: PayloadAction<ConflictRecord>) => {
      const existingIndex = state.conflicts.findIndex(c => c.id === action.payload.id);
      if (existingIndex === -1) {
        state.conflicts.push(action.payload);
      }
    },

    removeConflict: (state, action: PayloadAction<string>) => {
      state.conflicts = state.conflicts.filter(c => c.id !== action.payload);
    },

    updateConflictStatus: (state, action: PayloadAction<{ id: string; status: 'pending' | 'resolved' | 'ignored' }>) => {
      const conflict = state.conflicts.find(c => c.id === action.payload.id);
      if (conflict) {
        conflict.status = action.payload.status;
      }
    },

    // Optimistic conflict resolution for better UX
    optimisticResolveConflict: (state, action: PayloadAction<string>) => {
      const conflict = state.conflicts.find(c => c.id === action.payload);
      if (conflict) {
        conflict.status = 'resolved';
      }
    },

    revertOptimisticResolution: (state, action: PayloadAction<string>) => {
      const conflict = state.conflicts.find(c => c.id === action.payload);
      if (conflict) {
        conflict.status = 'pending';
      }
    }
  },

  extraReducers: (builder) => {
    builder
      // Full sync
      .addCase(performFullSync.pending, (state) => {
        state.isSyncing = true;
        state.error = null;
      })
      .addCase(performFullSync.fulfilled, (state, action) => {
        state.isSyncing = false;
        state.lastSyncResult = action.payload;
        state.lastSyncTime = new Date().toISOString();
        state.error = null;

        // Update conflicts from sync result
        if (action.payload.conflicts.length > 0) {
          action.payload.conflicts.forEach(conflict => {
            const existingIndex = state.conflicts.findIndex(c => c.id === conflict.id);
            if (existingIndex === -1) {
              state.conflicts.push(conflict);
            }
          });
        }
      })
      .addCase(performFullSync.rejected, (state, action) => {
        state.isSyncing = false;
        state.error = action.payload as string;
      })

      // Load conflicts
      .addCase(loadPendingConflicts.fulfilled, (state, action) => {
        state.conflicts = action.payload;
      })
      .addCase(loadPendingConflicts.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      // Resolve conflict
      .addCase(resolveConflict.pending, (state, action) => {
        // Optimistically mark as resolved
        const conflictId = action.meta.arg.conflictId;
        const conflict = state.conflicts.find(c => c.id === conflictId);
        if (conflict) {
          conflict.status = 'resolved';
        }
      })
      .addCase(resolveConflict.fulfilled, (state, action) => {
        // Remove resolved conflict
        state.conflicts = state.conflicts.filter(c => c.id !== action.payload);
      })
      .addCase(resolveConflict.rejected, (state, action) => {
        // Revert optimistic update
        const conflictId = action.meta.arg.conflictId;
        const conflict = state.conflicts.find(c => c.id === conflictId);
        if (conflict) {
          conflict.status = 'pending';
        }
        state.error = action.payload as string;
      })

      // Network status
      .addCase(checkNetworkStatus.fulfilled, (state, action) => {
        state.isOnline = action.payload;
      });
  }
});

export const {
  setOnlineStatus,
  setSyncInProgress,
  setSyncProgress,
  setLastSyncTime,
  setPendingOperations,
  setAutoSyncEnabled,
  setSyncInterval,
  clearError,
  addConflict,
  removeConflict,
  updateConflictStatus,
  optimisticResolveConflict,
  revertOptimisticResolution
} = syncSlice.actions;

export default syncSlice.reducer;
