/**
 * Chemicals Redux Slice
 * Manages chemicals state with offline-first architecture
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Chemical, ChemicalTransaction } from '../types';
import { databaseService } from '../database';

export interface ChemicalsState {
  chemicals: Chemical[];
  loading: boolean;
  error: string | null;
  lastSyncTime: string | null;
  syncInProgress: boolean;
  pendingChanges: number;
  searchQuery: string;
  filters: {
    category: string[];
    location: string[];
    lowStock: boolean;
    expired: boolean;
  };
}

const initialState: ChemicalsState = {
  chemicals: [],
  loading: false,
  error: null,
  lastSyncTime: null,
  syncInProgress: false,
  pendingChanges: 0,
  searchQuery: '',
  filters: {
    category: [],
    location: [],
    lowStock: false,
    expired: false
  }
};

// Async thunks for database operations
export const loadChemicals = createAsyncThunk(
  'chemicals/loadChemicals',
  async (_, { rejectWithValue }) => {
    try {
      const chemicals = await databaseService.findAll<Chemical>('chemicals');
      return chemicals;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to load chemicals');
    }
  }
);

export const createChemical = createAsyncThunk(
  'chemicals/createChemical',
  async (chemicalData: Omit<Chemical, 'id' | 'createdAt' | 'updatedAt'>, { rejectWithValue }) => {
    try {
      const chemicalId = `chemical_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const chemical = await databaseService.create<Chemical>('chemicals', {
        ...chemicalData,
        id: chemicalId
      });
      return chemical;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to create chemical');
    }
  }
);

export const updateChemical = createAsyncThunk(
  'chemicals/updateChemical',
  async ({ id, updates }: { id: string; updates: Partial<Chemical> }, { rejectWithValue }) => {
    try {
      const chemical = await databaseService.update<Chemical>('chemicals', id, updates);
      if (!chemical) {
        throw new Error('Chemical not found');
      }
      return chemical;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to update chemical');
    }
  }
);

export const deleteChemical = createAsyncThunk(
  'chemicals/deleteChemical',
  async (id: string, { rejectWithValue }) => {
    try {
      const success = await databaseService.delete('chemicals', id);
      if (!success) {
        throw new Error('Failed to delete chemical');
      }
      return id;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to delete chemical');
    }
  }
);

export const issueChemical = createAsyncThunk(
  'chemicals/issueChemical',
  async ({
    chemicalId,
    userId,
    quantity,
    notes
  }: {
    chemicalId: string;
    userId: string;
    quantity: number;
    notes?: string
  }, { rejectWithValue }) => {
    try {
      // Get current chemical to check available quantity
      const currentChemical = await databaseService.findById<Chemical>('chemicals', chemicalId);
      if (!currentChemical) {
        throw new Error('Chemical not found');
      }

      if (currentChemical.quantity < quantity) {
        throw new Error('Insufficient quantity available');
      }

      const now = new Date().toISOString();
      const newQuantity = currentChemical.quantity - quantity;

      // Update chemical quantity
      const chemical = await databaseService.update<Chemical>('chemicals', chemicalId, {
        quantity: newQuantity
      });

      if (!chemical) {
        throw new Error('Failed to update chemical quantity');
      }

      // Create transaction record
      const transactionId = `transaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await databaseService.create<ChemicalTransaction>('chemical_transactions', {
        id: transactionId,
        chemicalId,
        userId,
        transactionType: 'issue',
        quantity,
        transactionDate: now,
        notes: notes || `Chemical issued via mobile app`
      });

      return chemical;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to issue chemical');
    }
  }
);

export const receiveChemical = createAsyncThunk(
  'chemicals/receiveChemical',
  async ({
    chemicalId,
    userId,
    quantity,
    notes
  }: {
    chemicalId: string;
    userId: string;
    quantity: number;
    notes?: string
  }, { rejectWithValue }) => {
    try {
      // Get current chemical
      const currentChemical = await databaseService.findById<Chemical>('chemicals', chemicalId);
      if (!currentChemical) {
        throw new Error('Chemical not found');
      }

      const now = new Date().toISOString();
      const newQuantity = currentChemical.quantity + quantity;

      // Update chemical quantity
      const chemical = await databaseService.update<Chemical>('chemicals', chemicalId, {
        quantity: newQuantity
      });

      if (!chemical) {
        throw new Error('Failed to update chemical quantity');
      }

      // Create transaction record
      const transactionId = `transaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await databaseService.create<ChemicalTransaction>('chemical_transactions', {
        id: transactionId,
        chemicalId,
        userId,
        transactionType: 'receive',
        quantity,
        transactionDate: now,
        notes: notes || `Chemical received via mobile app`
      });

      return chemical;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to receive chemical');
    }
  }
);

export const adjustChemicalQuantity = createAsyncThunk(
  'chemicals/adjustQuantity',
  async ({
    chemicalId,
    userId,
    newQuantity,
    notes
  }: {
    chemicalId: string;
    userId: string;
    newQuantity: number;
    notes?: string
  }, { rejectWithValue }) => {
    try {
      // Get current chemical
      const currentChemical = await databaseService.findById<Chemical>('chemicals', chemicalId);
      if (!currentChemical) {
        throw new Error('Chemical not found');
      }

      const now = new Date().toISOString();
      const adjustmentQuantity = newQuantity - currentChemical.quantity;

      // Update chemical quantity
      const chemical = await databaseService.update<Chemical>('chemicals', chemicalId, {
        quantity: newQuantity
      });

      if (!chemical) {
        throw new Error('Failed to update chemical quantity');
      }

      // Create transaction record
      const transactionId = `transaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await databaseService.create<ChemicalTransaction>('chemical_transactions', {
        id: transactionId,
        chemicalId,
        userId,
        transactionType: 'adjustment',
        quantity: adjustmentQuantity,
        transactionDate: now,
        notes: notes || `Quantity adjusted via mobile app (${adjustmentQuantity > 0 ? '+' : ''}${adjustmentQuantity})`
      });

      return chemical;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to adjust chemical quantity');
    }
  }
);

export const searchChemicals = createAsyncThunk(
  'chemicals/searchChemicals',
  async (query: string, { rejectWithValue }) => {
    try {
      const whereClause = `(name LIKE ? OR chemicalNumber LIKE ? OR description LIKE ? OR category LIKE ?)`;
      const searchParam = `%${query}%`;
      const chemicals = await databaseService.findAll<Chemical>('chemicals', whereClause, [
        searchParam, searchParam, searchParam, searchParam
      ]);
      return { chemicals, query };
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to search chemicals');
    }
  }
);

export const getLowStockChemicals = createAsyncThunk(
  'chemicals/getLowStockChemicals',
  async (_, { rejectWithValue }) => {
    try {
      const chemicals = await databaseService.findAll<Chemical>('chemicals', 'quantity <= minimumStock');
      return chemicals;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to get low stock chemicals');
    }
  }
);

export const getExpiredChemicals = createAsyncThunk(
  'chemicals/getExpiredChemicals',
  async (_, { rejectWithValue }) => {
    try {
      const now = new Date().toISOString();
      const chemicals = await databaseService.findAll<Chemical>('chemicals', 'expirationDate IS NOT NULL AND expirationDate < ?', [now]);
      return chemicals;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to get expired chemicals');
    }
  }
);

const chemicalsSlice = createSlice({
  name: 'chemicals',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },
    setFilters: (state, action: PayloadAction<Partial<ChemicalsState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearFilters: (state) => {
      state.filters = {
        category: [],
        location: [],
        lowStock: false,
        expired: false
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
    optimisticUpdateChemical: (state, action: PayloadAction<{ id: string; updates: Partial<Chemical> }>) => {
      const { id, updates } = action.payload;
      const index = state.chemicals.findIndex(chemical => chemical.id === id);
      if (index !== -1) {
        state.chemicals[index] = { ...state.chemicals[index], ...updates };
      }
    },
    revertOptimisticUpdate: (state, action: PayloadAction<Chemical>) => {
      const chemical = action.payload;
      const index = state.chemicals.findIndex(c => c.id === chemical.id);
      if (index !== -1) {
        state.chemicals[index] = chemical;
      }
    }
  },
  extraReducers: (builder) => {
    builder
      // Load chemicals
      .addCase(loadChemicals.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadChemicals.fulfilled, (state, action) => {
        state.loading = false;
        state.chemicals = action.payload;
        state.error = null;
      })
      .addCase(loadChemicals.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Create chemical
      .addCase(createChemical.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createChemical.fulfilled, (state, action) => {
        state.loading = false;
        state.chemicals.unshift(action.payload);
        state.pendingChanges += 1;
        state.error = null;
      })
      .addCase(createChemical.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Update chemical
      .addCase(updateChemical.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateChemical.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.chemicals.findIndex(chemical => chemical.id === action.payload.id);
        if (index !== -1) {
          state.chemicals[index] = action.payload;
        }
        state.pendingChanges += 1;
        state.error = null;
      })
      .addCase(updateChemical.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Delete chemical
      .addCase(deleteChemical.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteChemical.fulfilled, (state, action) => {
        state.loading = false;
        state.chemicals = state.chemicals.filter(chemical => chemical.id !== action.payload);
        state.pendingChanges += 1;
        state.error = null;
      })
      .addCase(deleteChemical.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Issue chemical
      .addCase(issueChemical.fulfilled, (state, action) => {
        const index = state.chemicals.findIndex(chemical => chemical.id === action.payload.id);
        if (index !== -1) {
          state.chemicals[index] = action.payload;
        }
        state.pendingChanges += 1;
      })
      .addCase(issueChemical.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      // Receive chemical
      .addCase(receiveChemical.fulfilled, (state, action) => {
        const index = state.chemicals.findIndex(chemical => chemical.id === action.payload.id);
        if (index !== -1) {
          state.chemicals[index] = action.payload;
        }
        state.pendingChanges += 1;
      })
      .addCase(receiveChemical.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      // Adjust quantity
      .addCase(adjustChemicalQuantity.fulfilled, (state, action) => {
        const index = state.chemicals.findIndex(chemical => chemical.id === action.payload.id);
        if (index !== -1) {
          state.chemicals[index] = action.payload;
        }
        state.pendingChanges += 1;
      })
      .addCase(adjustChemicalQuantity.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      // Search chemicals
      .addCase(searchChemicals.fulfilled, (state, action) => {
        state.chemicals = action.payload.chemicals;
        state.searchQuery = action.payload.query;
      })
      .addCase(searchChemicals.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      // Low stock chemicals
      .addCase(getLowStockChemicals.fulfilled, (state, action) => {
        state.chemicals = action.payload;
      })

      // Expired chemicals
      .addCase(getExpiredChemicals.fulfilled, (state, action) => {
        state.chemicals = action.payload;
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
  optimisticUpdateChemical,
  revertOptimisticUpdate
} = chemicalsSlice.actions;

export default chemicalsSlice.reducer;
