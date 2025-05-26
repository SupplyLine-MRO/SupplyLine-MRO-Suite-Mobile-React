/**
 * Database Service Entry Point
 * Platform-aware database service that avoids importing expo-sqlite on web
 */

import { Platform } from 'react-native';

// Define common types
export interface DatabaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  lastSyncAt?: string;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error';
  localChanges: string;
  isActive?: number;
}

export interface OfflineQueueItem {
  id: string;
  operation: 'create' | 'update' | 'delete';
  tableName: string;
  recordId: string;
  data: string;
  priority: number;
  retryCount: number;
  maxRetries: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  createdAt: string;
  updatedAt: string;
  scheduledAt?: string;
}

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

// Define the database service interface
export interface IDatabaseService {
  initialize(): Promise<void>;
  create<T extends DatabaseRecord>(
    tableName: string,
    data: Omit<T, 'createdAt' | 'updatedAt' | 'syncStatus' | 'localChanges'>
  ): Promise<T>;
  findById<T>(tableName: string, id: string): Promise<T | null>;
  findAll<T>(tableName: string, where?: string, params?: any[]): Promise<T[]>;
  update<T extends DatabaseRecord>(
    tableName: string,
    id: string,
    updates: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'localChanges'>>
  ): Promise<T | null>;
  delete(tableName: string, id: string): Promise<boolean>;
  getPendingOperations(): Promise<OfflineQueueItem[]>;
  close(): Promise<void>;
}

// Create a lazy-loaded database service
class LazyDatabaseService implements IDatabaseService {
  private service: IDatabaseService | null = null;
  public isInitialized = false;

  private async getService(): Promise<IDatabaseService> {
    if (!this.service) {
      if (Platform.OS === 'web') {
        const { mockDatabaseService } = await import('./MockDatabaseService');
        this.service = mockDatabaseService as IDatabaseService;
      } else {
        const { databaseService } = await import('./DatabaseService');
        this.service = databaseService as unknown as IDatabaseService;
      }
    }
    return this.service!;
  }

  async initialize(): Promise<void> {
    const service = await this.getService();
    await service.initialize();
    this.isInitialized = true;
  }

  async create<T extends DatabaseRecord>(
    tableName: string,
    data: Omit<T, 'createdAt' | 'updatedAt' | 'syncStatus' | 'localChanges'>
  ): Promise<T> {
    const service = await this.getService();
    return service.create(tableName, data);
  }

  async findById<T>(tableName: string, id: string): Promise<T | null> {
    const service = await this.getService();
    return service.findById(tableName, id);
  }

  async findAll<T>(tableName: string, where?: string, params?: any[]): Promise<T[]> {
    const service = await this.getService();
    return service.findAll(tableName, where, params);
  }

  async update<T extends DatabaseRecord>(
    tableName: string,
    id: string,
    updates: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'localChanges'>>
  ): Promise<T | null> {
    const service = await this.getService();
    return service.update(tableName, id, updates);
  }

  async delete(tableName: string, id: string): Promise<boolean> {
    const service = await this.getService();
    return service.delete(tableName, id);
  }

  async getPendingOperations(): Promise<OfflineQueueItem[]> {
    const service = await this.getService();
    return service.getPendingOperations();
  }

  async close(): Promise<void> {
    const service = await this.getService();
    return service.close();
  }
}

// Export singleton instance
export const databaseService = new LazyDatabaseService();
