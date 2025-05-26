/**
 * Database Service Layer
 * Provides CRUD operations and database management for offline-first architecture
 */

import * as SQLite from 'expo-sqlite';
import {
  DATABASE_NAME,
  DATABASE_VERSION,
  CREATE_TABLES,
  CREATE_INDEXES,
  INITIAL_SYNC_METADATA
} from './schema';
import { Tool, Chemical, User } from '../types';

export interface DatabaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  lastSyncAt?: string;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error';
  localChanges: string; // JSON array of field names that changed locally
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

class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;
  private isInitialized = false;

  /**
   * Initialize the database connection and create tables
   */
  async initialize(): Promise<void> {
    try {
      if (this.isInitialized) {
        return;
      }

      this.db = await SQLite.openDatabaseAsync(DATABASE_NAME);

      // Enable foreign keys
      await this.db.execAsync('PRAGMA foreign_keys = ON;');

      // Create all tables
      await this.createTables();

      // Create indexes
      await this.createIndexes();

      // Initialize sync metadata
      await this.initializeSyncMetadata();

      this.isInitialized = true;
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Get database instance
   */
  private getDb(): SQLite.SQLiteDatabase {
    if (!this.db || !this.isInitialized) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Create all database tables
   */
  private async createTables(): Promise<void> {
    const db = this.getDb();

    for (const [tableName, createSQL] of Object.entries(CREATE_TABLES)) {
      try {
        await db.execAsync(createSQL);
        console.log(`Created table: ${tableName}`);
      } catch (error) {
        console.error(`Failed to create table ${tableName}:`, error);
        throw error;
      }
    }
  }

  /**
   * Create database indexes
   */
  private async createIndexes(): Promise<void> {
    const db = this.getDb();

    for (const [tableName, indexes] of Object.entries(CREATE_INDEXES)) {
      for (const indexSQL of indexes) {
        try {
          await db.execAsync(indexSQL);
        } catch (error) {
          console.error(`Failed to create index for ${tableName}:`, error);
          // Don't throw here, indexes are not critical for functionality
        }
      }
    }
  }

  /**
   * Initialize sync metadata for all tables
   */
  private async initializeSyncMetadata(): Promise<void> {
    const db = this.getDb();
    const now = new Date().toISOString();

    for (const metadata of INITIAL_SYNC_METADATA) {
      try {
        await db.runAsync(
          `INSERT OR IGNORE INTO sync_metadata
           (id, tableName, lastSyncTime, lastSyncVersion, pendingChanges, conflictCount, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
          [
            `sync_${metadata.tableName}`,
            metadata.tableName,
            metadata.lastSyncTime,
            metadata.lastSyncVersion,
            now,
            now
          ]
        );
      } catch (error) {
        console.error(`Failed to initialize sync metadata for ${metadata.tableName}:`, error);
      }
    }
  }

  /**
   * Generic CRUD Operations
   */

  /**
   * Create a new record
   */
  async create<T extends DatabaseRecord>(
    tableName: string,
    data: Omit<T, 'createdAt' | 'updatedAt' | 'syncStatus' | 'localChanges'>
  ): Promise<T> {
    const db = this.getDb();
    const now = new Date().toISOString();

    const record = {
      ...data,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending' as const,
      localChanges: JSON.stringify(['*']) // All fields are new
    };

    const columns = Object.keys(record).join(', ');
    const placeholders = Object.keys(record).map(() => '?').join(', ');
    const values = Object.values(record).map(v => v ?? null); // Convert undefined to null

    try {
      await db.runAsync(
        `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`,
        values
      );

      // Add to offline queue
      await this.addToOfflineQueue('create', tableName, record.id, JSON.stringify(record));

      return record as T;
    } catch (error) {
      console.error(`Failed to create record in ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Read a record by ID
   */
  async findById<T>(tableName: string, id: string): Promise<T | null> {
    const db = this.getDb();

    try {
      const result = await db.getFirstAsync<T>(
        `SELECT * FROM ${tableName} WHERE id = ? AND isActive = 1`,
        [id]
      );

      return result || null;
    } catch (error) {
      console.error(`Failed to find record in ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Read all records from a table
   */
  async findAll<T>(tableName: string, where?: string, params?: any[]): Promise<T[]> {
    const db = this.getDb();

    try {
      let query = `SELECT * FROM ${tableName} WHERE isActive = 1`;
      let queryParams = params || [];

      if (where) {
        query += ` AND ${where}`;
      }

      query += ' ORDER BY updatedAt DESC';

      const results = await db.getAllAsync<T>(query, queryParams);
      return results;
    } catch (error) {
      console.error(`Failed to find records in ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Update a record
   */
  async update<T extends DatabaseRecord>(
    tableName: string,
    id: string,
    updates: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'localChanges'>>
  ): Promise<T | null> {
    const db = this.getDb();
    const now = new Date().toISOString();

    // Get current record to track changes
    const currentRecord = await this.findById<T>(tableName, id);
    if (!currentRecord) {
      return null;
    }

    // Track which fields changed
    const changedFields = Object.keys(updates).filter(
      key => updates[key as keyof typeof updates] !== (currentRecord as any)[key]
    );

    if (changedFields.length === 0) {
      return currentRecord; // No changes
    }

    // Parse existing local changes
    let localChanges: string[] = [];
    try {
      localChanges = JSON.parse(currentRecord.localChanges || '[]');
    } catch {
      localChanges = [];
    }

    // Add new changed fields
    changedFields.forEach(field => {
      if (!localChanges.includes(field)) {
        localChanges.push(field);
      }
    });

    const updateData = {
      ...updates,
      updatedAt: now,
      syncStatus: 'pending' as const,
      localChanges: JSON.stringify(localChanges)
    };

    const setClause = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(updateData).map(v => v ?? null), id]; // Convert undefined to null

    try {
      await db.runAsync(
        `UPDATE ${tableName} SET ${setClause} WHERE id = ?`,
        values
      );

      // Add to offline queue
      await this.addToOfflineQueue('update', tableName, id, JSON.stringify(updateData));

      // Return updated record
      return await this.findById<T>(tableName, id);
    } catch (error) {
      console.error(`Failed to update record in ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Soft delete a record
   */
  async delete(tableName: string, id: string): Promise<boolean> {
    const db = this.getDb();
    const now = new Date().toISOString();

    try {
      await db.runAsync(
        `UPDATE ${tableName} SET isActive = 0, updatedAt = ?, syncStatus = 'pending' WHERE id = ?`,
        [now, id]
      );

      // Add to offline queue
      await this.addToOfflineQueue('delete', tableName, id, JSON.stringify({ isActive: 0 }));

      return true;
    } catch (error) {
      console.error(`Failed to delete record in ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Add operation to offline queue
   */
  private async addToOfflineQueue(
    operation: 'create' | 'update' | 'delete',
    tableName: string,
    recordId: string,
    data: string,
    priority: number = 0
  ): Promise<void> {
    const db = this.getDb();
    const now = new Date().toISOString();
    const queueId = `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      await db.runAsync(
        `INSERT INTO offline_queue
         (id, operation, tableName, recordId, data, priority, retryCount, maxRetries, status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, 0, 3, 'pending', ?, ?)`,
        [queueId, operation, tableName, recordId, data, priority, now, now]
      );
    } catch (error) {
      console.error('Failed to add to offline queue:', error);
      // Don't throw here, the main operation should still succeed
    }
  }

  /**
   * Get pending offline operations
   */
  async getPendingOperations(): Promise<OfflineQueueItem[]> {
    const db = this.getDb();

    try {
      const results = await db.getAllAsync<OfflineQueueItem>(
        `SELECT * FROM offline_queue
         WHERE status = 'pending' AND retryCount < maxRetries
         ORDER BY priority DESC, createdAt ASC`
      );

      return results;
    } catch (error) {
      console.error('Failed to get pending operations:', error);
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.closeAsync();
      this.db = null;
      this.isInitialized = false;
    }
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();
export default databaseService;
