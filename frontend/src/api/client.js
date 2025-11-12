/**
 * API Client for making authenticated requests to the backend
 */
import axios from 'axios';
import { getAccessToken } from '../auth/oauth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

// Create axios instance
const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Unauthorized - token might be expired
      console.error('Authentication failed - token might be expired');
      // Could redirect to login here
    }
    return Promise.reject(error);
  }
);

/**
 * Get user profile
 */
export async function getUserProfile() {
  const response = await apiClient.get('/profile');
  return response.data;
}

/**
 * List resources
 * @param {number|null} tenantId - Optional tenant filter (VULNERABLE if used)
 */
export async function listResources(tenantId = null) {
  const params = tenantId ? { tenant_id: tenantId } : {};
  const response = await apiClient.get('/resources', { params });
  return response.data;
}

/**
 * Get a specific resource
 * @param {number} resourceId - Resource ID
 */
export async function getResource(resourceId) {
  const response = await apiClient.get(`/resources/${resourceId}`);
  return response.data;
}

/**
 * Create a new resource
 * @param {Object} resourceData - Resource data
 */
export async function createResource(resourceData) {
  const response = await apiClient.post('/resources', resourceData);
  return response.data;
}

/**
 * Update a resource
 * @param {number} resourceId - Resource ID
 * @param {Object} resourceData - Updated data
 */
export async function updateResource(resourceId, resourceData) {
  const response = await apiClient.put(`/resources/${resourceId}`, resourceData);
  return response.data;
}

/**
 * Delete a resource
 * @param {number} resourceId - Resource ID
 */
export async function deleteResource(resourceId) {
  await apiClient.delete(`/resources/${resourceId}`);
}

export default apiClient;
