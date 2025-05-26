/**
 * Data Synchronization Service
 * Handles offline-first data sync with conflict resolution
 */

import { Platform } from 'react-native';
import { databaseService } from '../database';
import type { OfflineQueueItem } from '../database';

// Define interfaces locally to avoid importing from DatabaseService on web
export interface SyncMetadata {
  id: string;
  tableName: string;
  lastSyncTime: string;
  lastSyncVersion: number;
  pendingChanges: number;
  conflictCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConflictRecord {
  id: string;
  tableName: string;
  recordId: string;
  localData: string;
  serverData: string;
  conflictType: 'update' | 'delete' | 'create';
  status: 'pending' | 'resolved' | 'ignored';
  resolution?: string;
  createdAt: string;
  updatedAt: string;
}
import { apiService } from './api';
import { Tool, Chemical, User } from '../types';

export interface SyncResult {
  success: boolean;
  syncedTables: string[];
  conflicts: ConflictRecord[];
  errors: string[];
  totalSynced: number;
  totalConflicts: number;
}

export interface SyncProgress {
  table: string;
  progress: number;
  total: number;
  status: 'pending' | 'syncing' | 'completed' | 'error';
}

class SyncService {
  private isSyncing = false;
  private syncProgressCallbacks: ((progress: SyncProgress) => void)[] = [];

  /**
   * Register callback for sync progress updates
   */
  onSyncProgress(callback: (progress: SyncProgress) => void): () => void {
    this.syncProgressCallbacks.push(callback);
    return () => {
      const index = this.syncProgressCallbacks.indexOf(callback);
      if (index > -1) {
        this.syncProgressCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Emit sync progress to all registered callbacks
   */
  private emitProgress(progress: SyncProgress): void {
    this.syncProgressCallbacks.forEach(callback => callback(progress));
  }

  /**
   * Check if sync is currently in progress
   */
  isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  /**
   * Perform full data synchronization
   */
  async syncAll(): Promise<SyncResult> {
    if (this.isSyncing) {
      throw new Error('Sync already in progress');
    }

    // For web platform, return a mock successful sync for now
    if (Platform.OS === 'web') {
      console.log('Sync not implemented for web platform yet');
      return {
        success: true,
        syncedTables: [],
        conflicts: [],
        errors: [],
        totalSynced: 0,
        totalConflicts: 0
      };
    }

    this.isSyncing = true;
    const result: SyncResult = {
      success: true,
      syncedTables: [],
      conflicts: [],
      errors: [],
      totalSynced: 0,
      totalConflicts: 0
    };

    try {
      // First, push local changes to server
      await this.pushLocalChanges();

      // Then, pull server changes
      const tables = ['users', 'tools', 'chemicals', 'tool_transactions', 'chemical_transactions'];

      for (const table of tables) {
        try {
          this.emitProgress({ table, progress: 0, total: 100, status: 'syncing' });

          const tableResult = await this.syncTable(table);
          result.syncedTables.push(table);
          result.totalSynced += tableResult.synced;
          result.totalConflicts += tableResult.conflicts.length;
          result.conflicts.push(...tableResult.conflicts);

          this.emitProgress({ table, progress: 100, total: 100, status: 'completed' });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : `Failed to sync ${table}`;
          result.errors.push(errorMessage);
          result.success = false;

          this.emitProgress({ table, progress: 0, total: 100, status: 'error' });
          console.error(`Sync error for table ${table}:`, error);
        }
      }

      // Update sync metadata
      await this.updateSyncMetadata();

    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown sync error');
      console.error('Sync error:', error);
    } finally {
      this.isSyncing = false;
    }

    return result;
  }

  /**
   * Push local changes to server
   */
  private async pushLocalChanges(): Promise<void> {
    const pendingOperations = await databaseService.getPendingOperations();

    for (const operation of pendingOperations) {
      try {
        await this.processOfflineOperation(operation);
      } catch (error) {
        console.error('Failed to process offline operation:', error);
        // Mark operation as failed
        await this.markOperationFailed(operation.id, error instanceof Error ? error.message : 'Unknown error');
      }
    }
  }

  /**
   * Process a single offline operation
   */
  private async processOfflineOperation(operation: OfflineQueueItem): Promise<void> {
    const { operation: op, tableName, recordId, data } = operation;

    try {
      // Mark as processing
      await this.updateOperationStatus(operation.id, 'processing');

      let response;
      const parsedData = JSON.parse(data);

      switch (op) {
        case 'create':
          response = await apiService.post(`/${tableName}`, parsedData);
          break;
        case 'update':
          response = await apiService.put(`/${tableName}/${recordId}`, parsedData);
          break;
        case 'delete':
          response = await apiService.delete(`/${tableName}/${recordId}`);
          break;
        default:
          throw new Error(`Unknown operation: ${op}`);
      }

      if (response.success) {
        // Mark as completed
        await this.updateOperationStatus(operation.id, 'completed');

        // Update local record sync status
        await this.updateRecordSyncStatus(tableName, recordId, 'synced');
      } else {
        throw new Error(response.message || 'Server operation failed');
      }

    } catch (error) {
      // Increment retry count
      const newRetryCount = operation.retryCount + 1;

      if (newRetryCount >= operation.maxRetries) {
        await this.markOperationFailed(operation.id, error instanceof Error ? error.message : 'Max retries exceeded');
      } else {
        await this.incrementRetryCount(operation.id);
      }

      throw error;
    }
  }

  /**
   * Sync a specific table
   */
  private async syncTable(tableName: string): Promise<{ synced: number; conflicts: ConflictRecord[] }> {
    const metadata = await this.getSyncMetadata(tableName);
    const conflicts: ConflictRecord[] = [];

    try {
      // Get server data since last sync
      const response = await apiService.get(`/${tableName}/sync`, {
        lastSyncTime: metadata.lastSyncTime,
        lastSyncVersion: metadata.lastSyncVersion
      });

      if (!response.success || !response.data) {
        throw new Error(response.message || 'Failed to fetch server data');
      }

      const serverRecords = (response.data as any)?.records || [];
      const serverDeleted = (response.data as any)?.deleted || [];

      let syncedCount = 0;

      // Process server updates
      for (const serverRecord of serverRecords) {
        const localRecord = await databaseService.findById(tableName, serverRecord.id);

        if (!localRecord) {
          // New record from server - insert locally
          await this.insertServerRecord(tableName, serverRecord);
          syncedCount++;
        } else {
          // Check for conflicts
          const conflict = await this.detectConflict(tableName, localRecord, serverRecord);

          if (conflict) {
            conflicts.push(conflict);
          } else {
            // No conflict - update local record
            await this.updateLocalRecord(tableName, serverRecord);
            syncedCount++;
          }
        }
      }

      // Process server deletions
      for (const deletedId of serverDeleted) {
        const localRecord = await databaseService.findById(tableName, deletedId);

        if (localRecord && (localRecord as any).syncStatus === 'synced') {
          // Safe to delete locally
          await databaseService.delete(tableName, deletedId);
          syncedCount++;
        } else if (localRecord) {
          // Conflict - local changes on deleted record
          const conflict = await this.createDeleteConflict(tableName, localRecord, deletedId);
          conflicts.push(conflict);
        }
      }

      return { synced: syncedCount, conflicts };

    } catch (error) {
      console.error(`Failed to sync table ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Detect conflicts between local and server records
   */
  private async detectConflict(tableName: string, localRecord: any, serverRecord: any): Promise<ConflictRecord | null> {
    // If local record has no pending changes, no conflict
    if (localRecord.syncStatus === 'synced') {
      return null;
    }

    // If server record is newer and local has changes, it's a conflict
    const localUpdated = new Date(localRecord.updatedAt);
    const serverUpdated = new Date(serverRecord.updatedAt);

    if (serverUpdated > localUpdated && localRecord.syncStatus === 'pending') {
      return await this.createUpdateConflict(tableName, localRecord, serverRecord);
    }

    return null;
  }

  /**
   * Create update conflict record
   */
  private async createUpdateConflict(tableName: string, localRecord: any, serverRecord: any): Promise<ConflictRecord> {
    const conflictId = `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const conflict: ConflictRecord = {
      id: conflictId,
      tableName,
      recordId: localRecord.id,
      localData: JSON.stringify(localRecord),
      serverData: JSON.stringify(serverRecord),
      conflictType: 'update',
      status: 'pending',
      createdAt: now,
      updatedAt: now
    };

    await databaseService.create('conflicts', conflict);
    return conflict;
  }

  /**
   * Create delete conflict record
   */
  private async createDeleteConflict(tableName: string, localRecord: any, deletedId: string): Promise<ConflictRecord> {
    const conflictId = `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const conflict: ConflictRecord = {
      id: conflictId,
      tableName,
      recordId: deletedId,
      localData: JSON.stringify(localRecord),
      serverData: JSON.stringify({ id: deletedId, deleted: true }),
      conflictType: 'delete',
      status: 'pending',
      createdAt: now,
      updatedAt: now
    };

    await databaseService.create('conflicts', conflict);
    return conflict;
  }

  /**
   * Insert server record locally
   */
  private async insertServerRecord(tableName: string, serverRecord: any): Promise<void> {
    const record = {
      ...serverRecord,
      syncStatus: 'synced',
      localChanges: JSON.stringify([]),
      lastSyncAt: new Date().toISOString()
    };

    if (Platform.OS === 'web') {
      // For web, use the regular create method
      await databaseService.create(tableName, record);
      return;
    }

    // Use raw SQL to avoid triggering offline queue
    const db = (databaseService as any).getDb();
    const columns = Object.keys(record).join(', ');
    const placeholders = Object.keys(record).map(() => '?').join(', ');
    const values = Object.values(record);

    await db.runAsync(
      `INSERT OR REPLACE INTO ${tableName} (${columns}) VALUES (${placeholders})`,
      values
    );
  }

  /**
   * Update local record with server data
   */
  private async updateLocalRecord(tableName: string, serverRecord: any): Promise<void> {
    const updateData = {
      ...serverRecord,
      syncStatus: 'synced',
      localChanges: JSON.stringify([]),
      lastSyncAt: new Date().toISOString()
    };

    if (Platform.OS === 'web') {
      // For web, use the regular update method
      await databaseService.update(tableName, serverRecord.id, updateData);
      return;
    }

    // Use raw SQL to avoid triggering offline queue
    const db = (databaseService as any).getDb();
    const setClause = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(updateData), serverRecord.id];

    await db.runAsync(
      `UPDATE ${tableName} SET ${setClause} WHERE id = ?`,
      values
    );
  }

  /**
   * Get sync metadata for a table
   */
  private async getSyncMetadata(tableName: string): Promise<SyncMetadata> {
    const metadata = await databaseService.findById<SyncMetadata>('sync_metadata', `sync_${tableName}`);

    if (!metadata) {
      throw new Error(`Sync metadata not found for table: ${tableName}`);
    }

    return metadata;
  }

  /**
   * Update sync metadata after successful sync
   */
  private async updateSyncMetadata(): Promise<void> {
    if (Platform.OS === 'web') {
      // Skip sync metadata update for web for now
      return;
    }

    const now = new Date().toISOString();
    const tables = ['users', 'tools', 'chemicals', 'tool_transactions', 'chemical_transactions'];

    for (const tableName of tables) {
      try {
        // Use raw SQL to update sync metadata since it doesn't follow DatabaseRecord pattern
        const db = (databaseService as any).getDb();
        await db.runAsync(
          'UPDATE sync_metadata SET lastSyncTime = ?, lastSyncVersion = ?, updatedAt = ? WHERE id = ?',
          [now, Date.now(), now, `sync_${tableName}`]
        );
      } catch (error) {
        console.error(`Failed to update sync metadata for ${tableName}:`, error);
      }
    }
  }

  /**
   * Update operation status in offline queue
   */
  private async updateOperationStatus(operationId: string, status: 'pending' | 'processing' | 'completed' | 'failed'): Promise<void> {
    if (Platform.OS === 'web') {
      // Skip for web for now
      return;
    }

    const db = (databaseService as any).getDb();
    const now = new Date().toISOString();

    await db.runAsync(
      'UPDATE offline_queue SET status = ?, updatedAt = ? WHERE id = ?',
      [status, now, operationId]
    );
  }

  /**
   * Mark operation as failed
   */
  private async markOperationFailed(operationId: string, error: string): Promise<void> {
    if (Platform.OS === 'web') {
      // Skip for web for now
      return;
    }

    const db = (databaseService as any).getDb();
    const now = new Date().toISOString();

    await db.runAsync(
      'UPDATE offline_queue SET status = ?, error = ?, updatedAt = ? WHERE id = ?',
      ['failed', error, now, operationId]
    );
  }

  /**
   * Increment retry count for operation
   */
  private async incrementRetryCount(operationId: string): Promise<void> {
    if (Platform.OS === 'web') {
      // Skip for web for now
      return;
    }

    const db = (databaseService as any).getDb();
    const now = new Date().toISOString();

    await db.runAsync(
      'UPDATE offline_queue SET retryCount = retryCount + 1, updatedAt = ? WHERE id = ?',
      [now, operationId]
    );
  }

  /**
   * Update record sync status
   */
  private async updateRecordSyncStatus(tableName: string, recordId: string, status: 'synced' | 'pending' | 'conflict' | 'error'): Promise<void> {
    if (Platform.OS === 'web') {
      // Skip for web for now
      return;
    }

    const db = (databaseService as any).getDb();
    const now = new Date().toISOString();

    await db.runAsync(
      `UPDATE ${tableName} SET syncStatus = ?, lastSyncAt = ?, updatedAt = ? WHERE id = ?`,
      [status, now, now, recordId]
    );
  }

  /**
   * Get pending conflicts
   */
  async getPendingConflicts(): Promise<ConflictRecord[]> {
    return await databaseService.findAll<ConflictRecord>('conflicts', 'status = ?', ['pending']);
  }

  /**
   * Resolve conflict by choosing local or server version
   */
  async resolveConflict(conflictId: string, resolution: 'local' | 'server' | 'merge', mergedData?: any): Promise<void> {
    const conflict = await databaseService.findById<ConflictRecord>('conflicts', conflictId);

    if (!conflict) {
      throw new Error('Conflict not found');
    }

    const localData = JSON.parse(conflict.localData);
    const serverData = JSON.parse(conflict.serverData);

    let finalData;

    switch (resolution) {
      case 'local':
        finalData = localData;
        break;
      case 'server':
        finalData = serverData;
        break;
      case 'merge':
        if (!mergedData) {
          throw new Error('Merged data required for merge resolution');
        }
        finalData = mergedData;
        break;
      default:
        throw new Error('Invalid resolution type');
    }

    // Update the record with resolved data
    await this.updateLocalRecord(conflict.tableName, finalData);

    // Mark conflict as resolved using raw SQL since conflicts table doesn't extend DatabaseRecord
    const db = (databaseService as any).getDb();
    const now = new Date().toISOString();

    await db.runAsync(
      'UPDATE conflicts SET status = ?, resolution = ?, updatedAt = ? WHERE id = ?',
      ['resolved', JSON.stringify({ type: resolution, data: finalData }), now, conflictId]
    );
  }
}

// Export singleton instance
export const syncService = new SyncService();
export default syncService;
