import { User, Tool, Chemical, ApiResponse } from '../types';

// Base API configuration
const API_BASE_URL = __DEV__
  ? 'http://localhost:5000/api'
  : 'https://api.supplyline.com/api';

class ApiService {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  setAuthToken(token: string) {
    this.token = token;
  }

  clearAuthToken() {
    this.token = null;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.message || 'An error occurred',
        };
      }

      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  // Generic HTTP methods
  async get<T>(endpoint: string, params?: Record<string, any>): Promise<ApiResponse<T>> {
    const queryString = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request(`${endpoint}${queryString}`);
  }

  async post<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request(endpoint, {
      method: 'DELETE',
    });
  }

  // Authentication endpoints
  async login(username: string, password: string): Promise<ApiResponse<{ user: User; token: string }>> {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  async logout(): Promise<ApiResponse<void>> {
    return this.request('/auth/logout', {
      method: 'POST',
    });
  }

  async refreshToken(): Promise<ApiResponse<{ token: string }>> {
    return this.request('/auth/refresh', {
      method: 'POST',
    });
  }

  // Tools endpoints
  async getTools(): Promise<ApiResponse<Tool[]>> {
    return this.request('/tools');
  }

  async getTool(id: string): Promise<ApiResponse<Tool>> {
    return this.request(`/tools/${id}`);
  }

  async checkoutTool(toolId: string, userId: string): Promise<ApiResponse<Tool>> {
    return this.request(`/tools/${toolId}/checkout`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  async returnTool(toolId: string): Promise<ApiResponse<Tool>> {
    return this.request(`/tools/${toolId}/return`, {
      method: 'POST',
    });
  }

  // Chemicals endpoints
  async getChemicals(): Promise<ApiResponse<Chemical[]>> {
    return this.request('/chemicals');
  }

  async getChemical(id: string): Promise<ApiResponse<Chemical>> {
    return this.request(`/chemicals/${id}`);
  }

  async updateChemicalQuantity(
    chemicalId: string,
    quantity: number
  ): Promise<ApiResponse<Chemical>> {
    return this.request(`/chemicals/${chemicalId}/quantity`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    });
  }

  // Sync endpoints
  async syncData(lastSyncTime?: string): Promise<ApiResponse<{
    tools: Tool[];
    chemicals: Chemical[];
    timestamp: string;
  }>> {
    const params = lastSyncTime ? `?since=${lastSyncTime}` : '';
    return this.request(`/sync${params}`);
  }
}

export const apiService = new ApiService();
export default apiService;
