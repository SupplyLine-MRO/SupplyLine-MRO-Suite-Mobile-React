/**
 * Database Initialization Service
 * Handles database setup and initialization on app startup
 */

import { Platform } from 'react-native';
import { store } from '../store';
import { setLoading } from '../slices/appSlice';
import { setOnlineStatus, setPendingOperations } from '../slices/syncSlice';

export interface InitializationResult {
  success: boolean;
  error?: string;
  databaseReady: boolean;
  pendingOperations: number;
}

class DatabaseInitService {
  private isInitialized = false;

  /**
   * Initialize the database and set up the app
   */
  async initialize(): Promise<InitializationResult> {
    if (this.isInitialized) {
      return { success: true, databaseReady: true, pendingOperations: 0 };
    }

    try {
      // Set loading state
      store.dispatch(setLoading(true));

      console.log('Initializing app...');

      // Skip database initialization on web for now
      if (Platform.OS === 'web') {
        console.log('Skipping database initialization on web platform');

        // Check network status
        await this.checkNetworkStatus();

        // Set up periodic network checks
        this.setupNetworkMonitoring();

        this.isInitialized = true;

        return {
          success: true,
          databaseReady: false, // No database on web yet
          pendingOperations: 0
        };
      }

      // Initialize database for mobile platforms
      const { databaseService } = await import('../database');
      await databaseService.initialize();

      console.log('Database initialized successfully');

      // Check for pending operations
      const pendingOps = await databaseService.getPendingOperations();
      store.dispatch(setPendingOperations(pendingOps.length));

      // Check network status
      await this.checkNetworkStatus();

      // Set up periodic network checks
      this.setupNetworkMonitoring();

      this.isInitialized = true;

      return {
        success: true,
        databaseReady: true,
        pendingOperations: pendingOps.length
      };

    } catch (error) {
      console.error('App initialization failed:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown initialization error',
        databaseReady: false,
        pendingOperations: 0
      };
    } finally {
      store.dispatch(setLoading(false));
    }
  }

  /**
   * Check network connectivity
   */
  private async checkNetworkStatus(): Promise<void> {
    try {
      // Simple network check
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('https://www.google.com', {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-cache'
      });

      clearTimeout(timeoutId);
      store.dispatch(setOnlineStatus(response.ok));
    } catch (error) {
      console.log('Network check failed, assuming offline');
      store.dispatch(setOnlineStatus(false));
    }
  }

  /**
   * Set up periodic network monitoring
   */
  private setupNetworkMonitoring(): void {
    // Check network status every 30 seconds
    setInterval(() => {
      this.checkNetworkStatus();
    }, 30000);
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.isInitialized && Platform.OS !== 'web') {
      const { databaseService } = await import('../database');
      await databaseService.close();
      this.isInitialized = false;
    }
  }

  /**
   * Check if database is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

// Export singleton instance
export const databaseInitService = new DatabaseInitService();
export default databaseInitService;
