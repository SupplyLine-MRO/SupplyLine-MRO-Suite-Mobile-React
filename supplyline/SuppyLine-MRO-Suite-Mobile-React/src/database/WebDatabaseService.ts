/**
 * Web Database Service
 * Uses IndexedDB for web compatibility instead of SQLite
 */

// Define DatabaseRecord interface locally
export interface DatabaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  lastSyncAt?: string;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error';
  localChanges: string;
  isActive?: number;
}

interface IndexedDBRecord extends DatabaseRecord {
  [key: string]: any;
}

class WebDatabaseService {
  private db: IDBDatabase | null = null;
  private isInitialized = false;
  private dbName = 'supplyline_web_db';
  private version = 1;

  /**
   * Initialize IndexedDB
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.isInitialized = true;
        console.log('Web database initialized successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores (tables)
        const tables = ['users', 'tools', 'chemicals', 'tool_transactions', 'chemical_transactions', 'sync_metadata', 'conflicts', 'offline_queue'];

        tables.forEach(tableName => {
          if (!db.objectStoreNames.contains(tableName)) {
            const store = db.createObjectStore(tableName, { keyPath: 'id' });

            // Create indexes for common queries
            if (tableName === 'tools') {
              store.createIndex('toolNumber', 'toolNumber', { unique: true });
              store.createIndex('status', 'status');
              store.createIndex('category', 'category');
            } else if (tableName === 'chemicals') {
              store.createIndex('chemicalNumber', 'chemicalNumber', { unique: true });
              store.createIndex('category', 'category');
            }
          }
        });
      };
    });
  }

  /**
   * Get database instance
   */
  private getDb(): IDBDatabase {
    if (!this.db || !this.isInitialized) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

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
      localChanges: JSON.stringify(['*']),
      isActive: 1
    } as unknown as T;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);
      const request = store.add(record);

      request.onsuccess = () => {
        // Add to offline queue
        this.addToOfflineQueue('create', tableName, record.id, JSON.stringify(record));
        resolve(record);
      };

      request.onerror = () => {
        reject(new Error(`Failed to create record in ${tableName}`));
      };
    });
  }

  /**
   * Find record by ID
   */
  async findById<T>(tableName: string, id: string): Promise<T | null> {
    const db = this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([tableName], 'readonly');
      const store = transaction.objectStore(tableName);
      const request = store.get(id);

      request.onsuccess = () => {
        const result = request.result;
        if (result && result.isActive !== 0) {
          resolve(result as T);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        reject(new Error(`Failed to find record in ${tableName}`));
      };
    });
  }

  /**
   * Find all records
   */
  async findAll<T>(tableName: string, where?: string, params?: any[]): Promise<T[]> {
    const db = this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([tableName], 'readonly');
      const store = transaction.objectStore(tableName);
      const request = store.getAll();

      request.onsuccess = () => {
        let results = request.result as T[];

        // Filter out inactive records
        results = results.filter((record: any) => record.isActive !== 0);

        // Simple filtering for web (IndexedDB doesn't support complex WHERE clauses)
        if (where && params) {
          // This is a simplified implementation - in a real app you'd want more sophisticated filtering
          results = results.filter((record: any) => {
            if (where.includes('LIKE')) {
              // Simple LIKE implementation for search
              const searchTerm = params[0]?.replace(/%/g, '').toLowerCase();
              return Object.values(record).some(value =>
                String(value).toLowerCase().includes(searchTerm)
              );
            }
            return true;
          });
        }

        // Sort by updatedAt DESC
        results.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

        resolve(results);
      };

      request.onerror = () => {
        reject(new Error(`Failed to find records in ${tableName}`));
      };
    });
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

    // Get current record first
    const currentRecord = await this.findById<T>(tableName, id);
    if (!currentRecord) {
      return null;
    }

    const now = new Date().toISOString();

    // Track changed fields
    const changedFields = Object.keys(updates).filter(
      key => updates[key as keyof typeof updates] !== (currentRecord as any)[key]
    );

    if (changedFields.length === 0) {
      return currentRecord;
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

    const updatedRecord = {
      ...currentRecord,
      ...updates,
      updatedAt: now,
      syncStatus: 'pending' as const,
      localChanges: JSON.stringify(localChanges)
    } as T;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);
      const request = store.put(updatedRecord);

      request.onsuccess = () => {
        // Add to offline queue
        this.addToOfflineQueue('update', tableName, id, JSON.stringify(updates));
        resolve(updatedRecord);
      };

      request.onerror = () => {
        reject(new Error(`Failed to update record in ${tableName}`));
      };
    });
  }

  /**
   * Soft delete a record
   */
  async delete(tableName: string, id: string): Promise<boolean> {
    const now = new Date().toISOString();

    const result = await this.update(tableName, id, {
      isActive: 0,
      updatedAt: now,
      syncStatus: 'pending'
    } as any);

    if (result) {
      // Add to offline queue
      await this.addToOfflineQueue('delete', tableName, id, JSON.stringify({ isActive: 0 }));
      return true;
    }

    return false;
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

    const queueItem = {
      id: queueId,
      operation,
      tableName,
      recordId,
      data,
      priority,
      retryCount: 0,
      maxRetries: 3,
      status: 'pending',
      createdAt: now,
      updatedAt: now
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['offline_queue'], 'readwrite');
      const store = transaction.objectStore('offline_queue');
      const request = store.add(queueItem);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error('Failed to add to offline queue');
        resolve(); // Don't fail the main operation
      };
    });
  }

  /**
   * Get pending offline operations
   */
  async getPendingOperations(): Promise<any[]> {
    const db = this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['offline_queue'], 'readonly');
      const store = transaction.objectStore('offline_queue');
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result.filter((item: any) =>
          item.status === 'pending' && item.retryCount < item.maxRetries
        );

        // Sort by priority DESC, then by createdAt ASC
        results.sort((a: any, b: any) => {
          if (a.priority !== b.priority) {
            return b.priority - a.priority;
          }
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });

        resolve(results);
      };

      request.onerror = () => {
        reject(new Error('Failed to get pending operations'));
      };
    });
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
  }
}

// Export singleton instance
export const webDatabaseService = new WebDatabaseService();
export default webDatabaseService;
