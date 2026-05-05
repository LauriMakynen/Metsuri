import api from './api';
import type { Property, Marking, GeoJSONGeometry, MarkingType, GeometryType } from '../types';

// Auth API calls
export const authService = {
  register: async (email: string, password: string) => {
    const response = await api.post<{ token: string; user: { id: number; email: string } }>(
      '/api/auth/register',
      { email, password }
    );
    return response.data;
  },

  login: async (email: string, password: string) => {
    const response = await api.post<{ token: string; user: { id: number; email: string } }>(
      '/api/auth/login',
      { email, password }
    );
    return response.data;
  },
};

// Forest properties API calls
export const propertiesService = {
  getAll: async (): Promise<Property[]> => {
    const response = await api.get<Property[]>('/api/properties');
    return response.data;
  },

  create: async (name: string, geometry: GeoJSONGeometry): Promise<Property> => {
    const response = await api.post<Property>('/api/properties', { name, geometry });
    return response.data;
  },

  update: async (id: number, data: Partial<{ name: string; geometry: GeoJSONGeometry }>): Promise<Property> => {
    const response = await api.put<Property>(`/api/properties/${id}`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/api/properties/${id}`);
  },
};

// Map markings API calls
export const markingsService = {
  getAll: async (): Promise<Marking[]> => {
    const response = await api.get<Marking[]>('/api/markings');
    return response.data;
  },

  create: async (data: {
    property_id?: number;
    type: MarkingType;
    geometry_type: GeometryType;
    title: string;
    description?: string;
    geometry?: GeoJSONGeometry;
  }): Promise<Marking> => {
    const response = await api.post<Marking>('/api/markings', data);
    return response.data;
  },

  update: async (id: number, data: Partial<{
    type: MarkingType;
    geometry_type: GeometryType;
    title: string;
    description: string;
    geometry: GeoJSONGeometry;
    property_id: number;
  }>): Promise<Marking> => {
    const response = await api.put<Marking>(`/api/markings/${id}`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/api/markings/${id}`);
  },
};
