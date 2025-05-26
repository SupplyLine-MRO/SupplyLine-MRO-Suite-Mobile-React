// Navigation types
export type RootStackParamList = {
  Loading: undefined;
  Login: undefined;
  Dashboard: undefined;
};

// Base database record interface
export interface DatabaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  lastSyncAt?: string;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error';
  localChanges: string; // JSON array of field names that changed locally
  isActive?: number; // SQLite boolean (0 or 1)
}

// User types
export interface User extends DatabaseRecord {
  username: string;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
  department?: string;
}

// Tool types
export interface Tool extends DatabaseRecord {
  toolNumber: string;
  name: string;
  description?: string;
  category: string;
  location: string;
  status: 'available' | 'checked_out' | 'maintenance' | 'retired';
  checkedOutBy?: string;
  checkedOutDate?: string;
  dueDate?: string;
  calibrationDate?: string;
  nextCalibrationDate?: string;
  qrCode?: string;
  barcode?: string;
}

// Chemical types
export interface Chemical extends DatabaseRecord {
  name: string;
  chemicalNumber: string;
  description?: string;
  category: string;
  location: string;
  quantity: number;
  unit: string;
  minimumStock: number;
  maximumStock: number;
  expirationDate?: string;
  msdsUrl?: string;
  hazardClass?: string;
  qrCode?: string;
  barcode?: string;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// Sync types
export interface SyncData {
  tools: Tool[];
  chemicals: Chemical[];
  lastSyncTime: string;
}

// Transaction types
export interface ToolTransaction extends DatabaseRecord {
  toolId: string;
  userId: string;
  transactionType: 'checkout' | 'return' | 'maintenance' | 'calibration';
  transactionDate: string;
  dueDate?: string;
  notes?: string;
}

export interface ChemicalTransaction extends DatabaseRecord {
  chemicalId: string;
  userId: string;
  transactionType: 'issue' | 'receive' | 'adjustment' | 'disposal';
  quantity: number;
  transactionDate: string;
  notes?: string;
}

// Notification types
export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  timestamp: string;
  read: boolean;
}
