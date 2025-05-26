/**
 * SQLite Database Schema for SupplyLine Mobile App
 * Implements offline-first architecture with sync capabilities
 */

// Database version for migrations
export const DATABASE_VERSION = 1;
export const DATABASE_NAME = 'supplyline.db';

// SQL statements for creating tables
export const CREATE_TABLES = {
  // Users table
  users: `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      firstName TEXT,
      lastName TEXT,
      department TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      lastSyncAt TEXT,
      syncStatus TEXT DEFAULT 'synced',
      localChanges TEXT DEFAULT '[]'
    );
  `,

  // Tools table
  tools: `
    CREATE TABLE IF NOT EXISTS tools (
      id TEXT PRIMARY KEY,
      toolNumber TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      location TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('available', 'checked_out', 'maintenance', 'retired')),
      checkedOutBy TEXT,
      checkedOutDate TEXT,
      dueDate TEXT,
      calibrationDate TEXT,
      nextCalibrationDate TEXT,
      qrCode TEXT,
      barcode TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      lastSyncAt TEXT,
      syncStatus TEXT DEFAULT 'synced',
      localChanges TEXT DEFAULT '[]',
      FOREIGN KEY (checkedOutBy) REFERENCES users(id)
    );
  `,

  // Chemicals table
  chemicals: `
    CREATE TABLE IF NOT EXISTS chemicals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      chemicalNumber TEXT NOT NULL UNIQUE,
      description TEXT,
      category TEXT NOT NULL,
      location TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL,
      minimumStock REAL NOT NULL DEFAULT 0,
      maximumStock REAL NOT NULL DEFAULT 0,
      expirationDate TEXT,
      msdsUrl TEXT,
      hazardClass TEXT,
      qrCode TEXT,
      barcode TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      lastSyncAt TEXT,
      syncStatus TEXT DEFAULT 'synced',
      localChanges TEXT DEFAULT '[]'
    );
  `,

  // Tool transactions table (for checkout/return history)
  toolTransactions: `
    CREATE TABLE IF NOT EXISTS tool_transactions (
      id TEXT PRIMARY KEY,
      toolId TEXT NOT NULL,
      userId TEXT NOT NULL,
      transactionType TEXT NOT NULL CHECK (transactionType IN ('checkout', 'return', 'maintenance', 'calibration')),
      transactionDate TEXT NOT NULL,
      dueDate TEXT,
      notes TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      lastSyncAt TEXT,
      syncStatus TEXT DEFAULT 'synced',
      localChanges TEXT DEFAULT '[]',
      FOREIGN KEY (toolId) REFERENCES tools(id),
      FOREIGN KEY (userId) REFERENCES users(id)
    );
  `,

  // Chemical transactions table (for issue/receive history)
  chemicalTransactions: `
    CREATE TABLE IF NOT EXISTS chemical_transactions (
      id TEXT PRIMARY KEY,
      chemicalId TEXT NOT NULL,
      userId TEXT NOT NULL,
      transactionType TEXT NOT NULL CHECK (transactionType IN ('issue', 'receive', 'adjustment', 'disposal')),
      quantity REAL NOT NULL,
      transactionDate TEXT NOT NULL,
      notes TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      lastSyncAt TEXT,
      syncStatus TEXT DEFAULT 'synced',
      localChanges TEXT DEFAULT '[]',
      FOREIGN KEY (chemicalId) REFERENCES chemicals(id),
      FOREIGN KEY (userId) REFERENCES users(id)
    );
  `,

  // Sync metadata table
  syncMetadata: `
    CREATE TABLE IF NOT EXISTS sync_metadata (
      id TEXT PRIMARY KEY,
      tableName TEXT NOT NULL UNIQUE,
      lastSyncTime TEXT NOT NULL,
      lastSyncVersion INTEGER DEFAULT 0,
      pendingChanges INTEGER DEFAULT 0,
      conflictCount INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `,

  // Conflict resolution table
  conflicts: `
    CREATE TABLE IF NOT EXISTS conflicts (
      id TEXT PRIMARY KEY,
      tableName TEXT NOT NULL,
      recordId TEXT NOT NULL,
      localData TEXT NOT NULL,
      serverData TEXT NOT NULL,
      conflictType TEXT NOT NULL CHECK (conflictType IN ('update', 'delete', 'create')),
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'ignored')),
      resolution TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `,

  // Offline queue table for pending operations
  offlineQueue: `
    CREATE TABLE IF NOT EXISTS offline_queue (
      id TEXT PRIMARY KEY,
      operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
      tableName TEXT NOT NULL,
      recordId TEXT NOT NULL,
      data TEXT NOT NULL,
      priority INTEGER DEFAULT 0,
      retryCount INTEGER DEFAULT 0,
      maxRetries INTEGER DEFAULT 3,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
      error TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      scheduledAt TEXT
    );
  `
};

// Indexes for better performance
export const CREATE_INDEXES = {
  users: [
    'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);',
    'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);',
    'CREATE INDEX IF NOT EXISTS idx_users_sync_status ON users(syncStatus);'
  ],
  tools: [
    'CREATE INDEX IF NOT EXISTS idx_tools_number ON tools(toolNumber);',
    'CREATE INDEX IF NOT EXISTS idx_tools_status ON tools(status);',
    'CREATE INDEX IF NOT EXISTS idx_tools_category ON tools(category);',
    'CREATE INDEX IF NOT EXISTS idx_tools_location ON tools(location);',
    'CREATE INDEX IF NOT EXISTS idx_tools_checked_out_by ON tools(checkedOutBy);',
    'CREATE INDEX IF NOT EXISTS idx_tools_sync_status ON tools(syncStatus);'
  ],
  chemicals: [
    'CREATE INDEX IF NOT EXISTS idx_chemicals_number ON chemicals(chemicalNumber);',
    'CREATE INDEX IF NOT EXISTS idx_chemicals_category ON chemicals(category);',
    'CREATE INDEX IF NOT EXISTS idx_chemicals_location ON chemicals(location);',
    'CREATE INDEX IF NOT EXISTS idx_chemicals_sync_status ON chemicals(syncStatus);'
  ],
  toolTransactions: [
    'CREATE INDEX IF NOT EXISTS idx_tool_transactions_tool_id ON tool_transactions(toolId);',
    'CREATE INDEX IF NOT EXISTS idx_tool_transactions_user_id ON tool_transactions(userId);',
    'CREATE INDEX IF NOT EXISTS idx_tool_transactions_type ON tool_transactions(transactionType);',
    'CREATE INDEX IF NOT EXISTS idx_tool_transactions_date ON tool_transactions(transactionDate);',
    'CREATE INDEX IF NOT EXISTS idx_tool_transactions_sync_status ON tool_transactions(syncStatus);'
  ],
  chemicalTransactions: [
    'CREATE INDEX IF NOT EXISTS idx_chemical_transactions_chemical_id ON chemical_transactions(chemicalId);',
    'CREATE INDEX IF NOT EXISTS idx_chemical_transactions_user_id ON chemical_transactions(userId);',
    'CREATE INDEX IF NOT EXISTS idx_chemical_transactions_type ON chemical_transactions(transactionType);',
    'CREATE INDEX IF NOT EXISTS idx_chemical_transactions_date ON chemical_transactions(transactionDate);',
    'CREATE INDEX IF NOT EXISTS idx_chemical_transactions_sync_status ON chemical_transactions(syncStatus);'
  ],
  conflicts: [
    'CREATE INDEX IF NOT EXISTS idx_conflicts_table_record ON conflicts(tableName, recordId);',
    'CREATE INDEX IF NOT EXISTS idx_conflicts_status ON conflicts(status);'
  ],
  offlineQueue: [
    'CREATE INDEX IF NOT EXISTS idx_offline_queue_status ON offline_queue(status);',
    'CREATE INDEX IF NOT EXISTS idx_offline_queue_table_record ON offline_queue(tableName, recordId);',
    'CREATE INDEX IF NOT EXISTS idx_offline_queue_priority ON offline_queue(priority);',
    'CREATE INDEX IF NOT EXISTS idx_offline_queue_scheduled ON offline_queue(scheduledAt);'
  ]
};

// Initial data for sync metadata
export const INITIAL_SYNC_METADATA = [
  { tableName: 'users', lastSyncTime: '1970-01-01T00:00:00.000Z', lastSyncVersion: 0 },
  { tableName: 'tools', lastSyncTime: '1970-01-01T00:00:00.000Z', lastSyncVersion: 0 },
  { tableName: 'chemicals', lastSyncTime: '1970-01-01T00:00:00.000Z', lastSyncVersion: 0 },
  { tableName: 'tool_transactions', lastSyncTime: '1970-01-01T00:00:00.000Z', lastSyncVersion: 0 },
  { tableName: 'chemical_transactions', lastSyncTime: '1970-01-01T00:00:00.000Z', lastSyncVersion: 0 }
];
