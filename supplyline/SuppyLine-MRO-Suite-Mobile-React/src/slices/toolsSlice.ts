/**
 * Tools Redux Slice
 * Manages tools state with offline-first architecture
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Tool, ToolTransaction } from '../types';
import { databaseService } from '../database';

export interface ToolsState {
  tools: Tool[];
  loading: boolean;
  error: string | null;
  lastSyncTime: string | null;
  syncInProgress: boolean;
  pendingChanges: number;
  searchQuery: string;
  filters: {
    status: string[];
    category: string[];
    location: string[];
  };
}

const initialState: ToolsState = {
  tools: [],
  loading: false,
  error: null,
  lastSyncTime: null,
  syncInProgress: false,
  pendingChanges: 0,
  searchQuery: '',
  filters: {
    status: [],
    category: [],
    location: []
  }
};

// Async thunks for database operations
export const loadTools = createAsyncThunk(
  'tools/loadTools',
  async (_, { rejectWithValue }) => {
    try {
      const tools = await databaseService.findAll<Tool>('tools');
      return tools;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to load tools');
    }
  }
);

export const createTool = createAsyncThunk(
  'tools/createTool',
  async (toolData: Omit<Tool, 'id' | 'createdAt' | 'updatedAt'>, { rejectWithValue }) => {
    try {
      const toolId = `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const tool = await databaseService.create<Tool>('tools', {
        ...toolData,
        id: toolId
      });
      return tool;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to create tool');
    }
  }
);

export const updateTool = createAsyncThunk(
  'tools/updateTool',
  async ({ id, updates }: { id: string; updates: Partial<Tool> }, { rejectWithValue }) => {
    try {
      const tool = await databaseService.update<Tool>('tools', id, updates);
      if (!tool) {
        throw new Error('Tool not found');
      }
      return tool;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to update tool');
    }
  }
);

export const deleteTool = createAsyncThunk(
  'tools/deleteTool',
  async (id: string, { rejectWithValue }) => {
    try {
      const success = await databaseService.delete('tools', id);
      if (!success) {
        throw new Error('Failed to delete tool');
      }
      return id;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to delete tool');
    }
  }
);

export const checkoutTool = createAsyncThunk(
  'tools/checkoutTool',
  async ({ toolId, userId, dueDate }: { toolId: string; userId: string; dueDate?: string }, { rejectWithValue }) => {
    try {
      const now = new Date().toISOString();
      const tool = await databaseService.update<Tool>('tools', toolId, {
        status: 'checked_out',
        checkedOutBy: userId,
        checkedOutDate: now,
        dueDate: dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // Default 7 days
      });

      if (!tool) {
        throw new Error('Tool not found');
      }

      // Create transaction record
      const transactionId = `transaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await databaseService.create<ToolTransaction>('tool_transactions', {
        id: transactionId,
        toolId,
        userId,
        transactionType: 'checkout',
        transactionDate: now,
        dueDate: tool.dueDate,
        notes: `Tool checked out via mobile app`
      });

      return tool;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to checkout tool');
    }
  }
);

export const returnTool = createAsyncThunk(
  'tools/returnTool',
  async ({ toolId, userId, notes }: { toolId: string; userId: string; notes?: string }, { rejectWithValue }) => {
    try {
      const now = new Date().toISOString();
      const tool = await databaseService.update<Tool>('tools', toolId, {
        status: 'available',
        checkedOutBy: undefined,
        checkedOutDate: undefined,
        dueDate: undefined
      });

      if (!tool) {
        throw new Error('Tool not found');
      }

      // Create transaction record
      const transactionId = `transaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await databaseService.create<ToolTransaction>('tool_transactions', {
        id: transactionId,
        toolId,
        userId,
        transactionType: 'return',
        transactionDate: now,
        notes: notes || `Tool returned via mobile app`
      });

      return tool;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to return tool');
    }
  }
);

export const searchTools = createAsyncThunk(
  'tools/searchTools',
  async (query: string, { rejectWithValue }) => {
    try {
      const whereClause = `(name LIKE ? OR toolNumber LIKE ? OR description LIKE ? OR category LIKE ?)`;
      const searchParam = `%${query}%`;
      const tools = await databaseService.findAll<Tool>('tools', whereClause, [
        searchParam, searchParam, searchParam, searchParam
      ]);
      return { tools, query };
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to search tools');
    }
  }
);

const toolsSlice = createSlice({
  name: 'tools',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },
    setFilters: (state, action: PayloadAction<Partial<ToolsState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearFilters: (state) => {
      state.filters = {
        status: [],
        category: [],
        location: []
      };
      state.searchQuery = '';
    },
    setSyncInProgress: (state, action: PayloadAction<boolean>) => {
      state.syncInProgress = action.payload;
    },
    setLastSyncTime: (state, action: PayloadAction<string>) => {
      state.lastSyncTime = action.payload;
    },
    setPendingChanges: (state, action: PayloadAction<number>) => {
      state.pendingChanges = action.payload;
    },
    // Optimistic updates for better UX
    optimisticUpdateTool: (state, action: PayloadAction<{ id: string; updates: Partial<Tool> }>) => {
      const { id, updates } = action.payload;
      const index = state.tools.findIndex(tool => tool.id === id);
      if (index !== -1) {
        state.tools[index] = { ...state.tools[index], ...updates };
      }
    },
    revertOptimisticUpdate: (state, action: PayloadAction<Tool>) => {
      const tool = action.payload;
      const index = state.tools.findIndex(t => t.id === tool.id);
      if (index !== -1) {
        state.tools[index] = tool;
      }
    }
  },
  extraReducers: (builder) => {
    builder
      // Load tools
      .addCase(loadTools.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadTools.fulfilled, (state, action) => {
        state.loading = false;
        state.tools = action.payload;
        state.error = null;
      })
      .addCase(loadTools.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Create tool
      .addCase(createTool.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createTool.fulfilled, (state, action) => {
        state.loading = false;
        state.tools.unshift(action.payload);
        state.pendingChanges += 1;
        state.error = null;
      })
      .addCase(createTool.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Update tool
      .addCase(updateTool.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateTool.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.tools.findIndex(tool => tool.id === action.payload.id);
        if (index !== -1) {
          state.tools[index] = action.payload;
        }
        state.pendingChanges += 1;
        state.error = null;
      })
      .addCase(updateTool.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Delete tool
      .addCase(deleteTool.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteTool.fulfilled, (state, action) => {
        state.loading = false;
        state.tools = state.tools.filter(tool => tool.id !== action.payload);
        state.pendingChanges += 1;
        state.error = null;
      })
      .addCase(deleteTool.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Checkout tool
      .addCase(checkoutTool.fulfilled, (state, action) => {
        const index = state.tools.findIndex(tool => tool.id === action.payload.id);
        if (index !== -1) {
          state.tools[index] = action.payload;
        }
        state.pendingChanges += 1;
      })
      .addCase(checkoutTool.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      // Return tool
      .addCase(returnTool.fulfilled, (state, action) => {
        const index = state.tools.findIndex(tool => tool.id === action.payload.id);
        if (index !== -1) {
          state.tools[index] = action.payload;
        }
        state.pendingChanges += 1;
      })
      .addCase(returnTool.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      // Search tools
      .addCase(searchTools.fulfilled, (state, action) => {
        state.tools = action.payload.tools;
        state.searchQuery = action.payload.query;
      })
      .addCase(searchTools.rejected, (state, action) => {
        state.error = action.payload as string;
      });
  }
});

export const {
  clearError,
  setSearchQuery,
  setFilters,
  clearFilters,
  setSyncInProgress,
  setLastSyncTime,
  setPendingChanges,
  optimisticUpdateTool,
  revertOptimisticUpdate
} = toolsSlice.actions;

export default toolsSlice.reducer;
