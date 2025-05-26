/**
 * Mock SQLite module for web compatibility
 * This replaces expo-sqlite when running on web
 */

// Mock SQLite database interface
export interface SQLiteDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: any[]): Promise<any>;
  getFirstAsync<T>(sql: string, params?: any[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params?: any[]): Promise<T[]>;
  closeAsync(): Promise<void>;
}

// Mock database implementation
class MockSQLiteDatabase implements SQLiteDatabase {
  async execAsync(sql: string): Promise<void> {
    console.log('Mock SQLite execAsync:', sql);
  }

  async runAsync(sql: string, params?: any[]): Promise<any> {
    console.log('Mock SQLite runAsync:', sql, params);
    return { changes: 1, insertId: Date.now() };
  }

  async getFirstAsync<T>(sql: string, params?: any[]): Promise<T | null> {
    console.log('Mock SQLite getFirstAsync:', sql, params);
    return null;
  }

  async getAllAsync<T>(sql: string, params?: any[]): Promise<T[]> {
    console.log('Mock SQLite getAllAsync:', sql, params);
    return [];
  }

  async closeAsync(): Promise<void> {
    console.log('Mock SQLite closeAsync');
  }
}

// Mock openDatabaseAsync function
export async function openDatabaseAsync(databaseName: string): Promise<SQLiteDatabase> {
  console.log('Mock SQLite openDatabaseAsync:', databaseName);
  return new MockSQLiteDatabase();
}

// Export everything that expo-sqlite normally exports
export default {
  openDatabaseAsync,
};
