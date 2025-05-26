/**
 * Mock Database Service for Web
 * Simple in-memory storage for testing and development
 */

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

class MockDatabaseService {
  private storage: Map<string, Map<string, any>> = new Map();
  private offlineQueue: OfflineQueueItem[] = [];
  public isInitialized = false;

  /**
   * Initialize the mock database
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Initialize empty tables
    const tables = ['users', 'tools', 'chemicals', 'tool_transactions', 'chemical_transactions', 'sync_metadata', 'conflicts', 'offline_queue'];
    
    tables.forEach(tableName => {
      this.storage.set(tableName, new Map());
    });

    // Add some sample data for testing
    await this.addSampleData();

    this.isInitialized = true;
    console.log('Mock database initialized successfully');
  }

  /**
   * Add sample data for testing
   */
  private async addSampleData(): Promise<void> {
    const now = new Date().toISOString();

    // Sample tools
    const sampleTools = [
      {
        id: 'tool_1',
        toolNumber: 'T001',
        name: 'Digital Multimeter',
        description: 'Fluke 87V Digital Multimeter',
        category: 'Electronics',
        location: 'Lab A - Shelf 1',
        status: 'available',
        createdAt: now,
        updatedAt: now,
        syncStatus: 'synced',
        localChanges: '[]',
        isActive: 1
      },
      {
        id: 'tool_2',
        toolNumber: 'T002',
        name: 'Oscilloscope',
        description: 'Tektronix TDS2024C Oscilloscope',
        category: 'Electronics',
        location: 'Lab A - Bench 2',
        status: 'checked_out',
        checkedOutBy: 'user_1',
        checkedOutDate: now,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: now,
        updatedAt: now,
        syncStatus: 'synced',
        localChanges: '[]',
        isActive: 1
      }
    ];

    // Sample chemicals
    const sampleChemicals = [
      {
        id: 'chemical_1',
        chemicalNumber: 'C001',
        name: 'Isopropyl Alcohol',
        description: '99% Pure Isopropyl Alcohol',
        category: 'Solvents',
        location: 'Chemical Storage - Cabinet A',
        quantity: 5.5,
        unit: 'L',
        minimumStock: 2.0,
        maximumStock: 10.0,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'synced',
        localChanges: '[]',
        isActive: 1
      },
      {
        id: 'chemical_2',
        chemicalNumber: 'C002',
        name: 'Acetone',
        description: 'Technical Grade Acetone',
        category: 'Solvents',
        location: 'Chemical Storage - Cabinet B',
        quantity: 1.2,
        unit: 'L',
        minimumStock: 2.0,
        maximumStock: 8.0,
        expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: now,
        updatedAt: now,
        syncStatus: 'synced',
        localChanges: '[]',
        isActive: 1
      }
    ];

    // Store sample data
    const toolsTable = this.storage.get('tools')!;
    sampleTools.forEach(tool => toolsTable.set(tool.id, tool));

    const chemicalsTable = this.storage.get('chemicals')!;
    sampleChemicals.forEach(chemical => chemicalsTable.set(chemical.id, chemical));
  }

  /**
   * Create a new record
   */
  async create<T extends DatabaseRecord>(
    tableName: string, 
    data: Omit<T, 'createdAt' | 'updatedAt' | 'syncStatus' | 'localChanges'>
  ): Promise<T> {
    const now = new Date().toISOString();
    
    const record = {
      ...data,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending' as const,
      localChanges: JSON.stringify(['*']),
      isActive: 1
    } as unknown as T;

    const table = this.storage.get(tableName);
    if (!table) {
      throw new Error(`Table ${tableName} not found`);
    }

    table.set(record.id, record);

    // Add to offline queue
    await this.addToOfflineQueue('create', tableName, record.id, JSON.stringify(record));
    
    return record;
  }

  /**
   * Find record by ID
   */
  async findById<T>(tableName: string, id: string): Promise<T | null> {
    const table = this.storage.get(tableName);
    if (!table) {
      throw new Error(`Table ${tableName} not found`);
    }

    const record = table.get(id);
    if (record && record.isActive !== 0) {
      return record as T;
    }
    
    return null;
  }

  /**
   * Find all records
   */
  async findAll<T>(tableName: string, where?: string, params?: any[]): Promise<T[]> {
    const table = this.storage.get(tableName);
    if (!table) {
      throw new Error(`Table ${tableName} not found`);
    }

    let results = Array.from(table.values()).filter((record: any) => record.isActive !== 0);
    
    // Simple filtering for mock implementation
    if (where && params) {
      if (where.includes('LIKE')) {
        // Simple LIKE implementation for search
        const searchTerm = params[0]?.replace(/%/g, '').toLowerCase();
        results = results.filter((record: any) => 
          Object.values(record).some(value => 
            String(value).toLowerCase().includes(searchTerm)
          )
        );
      } else if (where.includes('<=')) {
        // Simple comparison for low stock
        results = results.filter((record: any) => 
          record.quantity <= record.minimumStock
        );
      } else if (where.includes('<')) {
        // Simple comparison for expired items
        const now = new Date().toISOString();
        results = results.filter((record: any) => 
          record.expirationDate && record.expirationDate < now
        );
      }
    }
    
    // Sort by updatedAt DESC
    results.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    
    return results as T[];
  }

  /**
   * Update a record
   */
  async update<T extends DatabaseRecord>(
    tableName: string, 
    id: string, 
    updates: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'localChanges'>>
  ): Promise<T | null> {
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

    const table = this.storage.get(tableName)!;
    table.set(id, updatedRecord);

    // Add to offline queue
    await this.addToOfflineQueue('update', tableName, id, JSON.stringify(updates));

    return updatedRecord;
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
    const now = new Date().toISOString();
    const queueId = `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const queueItem: OfflineQueueItem = {
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

    this.offlineQueue.push(queueItem);
  }

  /**
   * Get pending offline operations
   */
  async getPendingOperations(): Promise<OfflineQueueItem[]> {
    return this.offlineQueue.filter(item => 
      item.status === 'pending' && item.retryCount < item.maxRetries
    ).sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    this.storage.clear();
    this.offlineQueue = [];
    this.isInitialized = false;
  }
}

// Export singleton instance
export const mockDatabaseService = new MockDatabaseService();
export default mockDatabaseService;
