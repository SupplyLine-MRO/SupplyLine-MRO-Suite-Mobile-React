/**
 * Platform-aware Database Service
 * Uses SQLite for mobile and IndexedDB for web
 */

import { Platform } from 'react-native';

// Define interfaces locally to avoid importing from DatabaseService on web
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

// Import services conditionally to avoid bundling expo-sqlite on web
let databaseService: any;
let mockDatabaseService: any;

// Use dynamic imports to prevent bundling issues
const getService = async () => {
  if (Platform.OS === 'web') {
    if (!mockDatabaseService) {
      const module = await import('./MockDatabaseService');
      mockDatabaseService = module.default;
    }
    return mockDatabaseService;
  } else {
    if (!databaseService) {
      const module = await import('./DatabaseService');
      databaseService = module.default;
    }
    return databaseService;
  }
};

class PlatformDatabaseService {
  private service: any;

  constructor() {
    // Service will be initialized lazily
  }

  /**
   * Get the appropriate service instance
   */
  private async getServiceInstance(): Promise<any> {
    if (!this.service) {
      this.service = await getService();
    }
    return this.service;
  }

  /**
   * Initialize the database
   */
  async initialize(): Promise<void> {
    const service = await this.getServiceInstance();
    return service.initialize();
  }

  /**
   * Create a new record
   */
  async create<T extends DatabaseRecord>(
    tableName: string,
    data: Omit<T, 'createdAt' | 'updatedAt' | 'syncStatus' | 'localChanges'>
  ): Promise<T> {
    const service = await this.getServiceInstance();
    return service.create(tableName, data) as Promise<T>;
  }

  /**
   * Find record by ID
   */
  async findById<T>(tableName: string, id: string): Promise<T | null> {
    const service = await this.getServiceInstance();
    return service.findById(tableName, id) as Promise<T | null>;
  }

  /**
   * Find all records
   */
  async findAll<T>(tableName: string, where?: string, params?: any[]): Promise<T[]> {
    const service = await this.getServiceInstance();
    return service.findAll(tableName, where, params) as Promise<T[]>;
  }

  /**
   * Update a record
   */
  async update<T extends DatabaseRecord>(
    tableName: string,
    id: string,
    updates: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'localChanges'>>
  ): Promise<T | null> {
    const service = await this.getServiceInstance();
    return service.update(tableName, id, updates) as Promise<T | null>;
  }

  /**
   * Delete a record
   */
  async delete(tableName: string, id: string): Promise<boolean> {
    const service = await this.getServiceInstance();
    return service.delete(tableName, id);
  }

  /**
   * Get pending offline operations
   */
  async getPendingOperations(): Promise<OfflineQueueItem[]> {
    const service = await this.getServiceInstance();
    return service.getPendingOperations();
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    const service = await this.getServiceInstance();
    return service.close();
  }

  /**
   * Check if database is initialized
   */
  isReady(): boolean {
    return this.service?.isInitialized || this.service?.isReady?.() || false;
  }
}

// Export singleton instance
export const platformDatabaseService = new PlatformDatabaseService();
export default platformDatabaseService;
