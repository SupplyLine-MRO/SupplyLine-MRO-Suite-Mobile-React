// Navigation types
export type RootStackParamList = {
  Loading: undefined;
  Login: undefined;
  Dashboard: undefined;
};

// User types
export interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
  department?: string;
}

// Tool types
export interface Tool {
  id: string;
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
export interface Chemical {
  id: string;
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

// Notification types
export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  timestamp: string;
  read: boolean;
}
