import api from './api';
import type {
  Property,
  Marking,
  GeoJSONGeometry,
  MarkingType,
  GeometryType,
  CadastreFeature,
  MapLayerConfig,
  ForestDataResponse,
  ForestValuationResponse,
} from '../types';

function normalizeDate(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    return value.length >= 10 ? value.slice(0, 10) : value;
  }
  return null;
}

function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeGeometry(value: unknown): GeoJSONGeometry {
  if (!value) return null;

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as GeoJSONGeometry;
    } catch {
      return null;
    }
  }

  if (typeof value === 'object') {
    return value as GeoJSONGeometry;
  }

  return null;
}

function normalizeMarking(marking: Marking): Marking {
  return {
    ...marking,
    geometry: normalizeGeometry(marking.geometry),
    area_ha: normalizeNumber(marking.area_ha),
    operation_date: normalizeDate(marking.operation_date),
    follow_up_date_start: normalizeDate(marking.follow_up_date_start),
    follow_up_date_end: normalizeDate(marking.follow_up_date_end),
  };
}

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

  importFromCadastre: async (data: {
    name?: string;
    property_code: string;
    geometry: GeoJSONGeometry;
    area_ha?: number;
  }): Promise<Property> => {
    const response = await api.post<Property>('/api/properties/import', data);
    return response.data;
  },

  getMarkings: async (propertyId: number): Promise<Marking[]> => {
    const response = await api.get<Marking[]>(`/api/properties/${propertyId}/markings`);
    return response.data.map(normalizeMarking);
  },

  getForestData: async (propertyId: number): Promise<ForestDataResponse> => {
    const response = await api.get<ForestDataResponse>(`/api/properties/${propertyId}/forest-data`);
    return response.data;
  },

  getValuation: async (propertyId: number): Promise<ForestValuationResponse> => {
    const response = await api.get<ForestValuationResponse>(`/api/properties/${propertyId}/valuation`);
    return response.data;
  },
};

// Map markings API calls
export const markingsService = {
  getAll: async (propertyId?: number): Promise<Marking[]> => {
    const params = propertyId ? { propertyId } : undefined;
    const response = await api.get<Marking[]>('/api/markings', { params });
    return response.data.map(normalizeMarking);
  },

  create: async (data: {
    property_id?: number;
    type: MarkingType;
    geometry_type: GeometryType;
    title: string;
    description?: string;
    geometry?: GeoJSONGeometry;
    area_ha?: number | null;
    operation_date: string;
  }): Promise<Marking> => {
    const response = await api.post<Marking>('/api/markings', data);
    return normalizeMarking(response.data);
  },

  update: async (id: number, data: Partial<{
    type: MarkingType;
    geometry_type: GeometryType;
    title: string;
    description: string;
    geometry: GeoJSONGeometry;
    property_id: number;
    area_ha: number | null;
    operation_date: string | null;
    follow_up_note: string | null;
    follow_up_date_start: string | null;
    follow_up_date_end: string | null;
  }>): Promise<Marking> => {
    const response = await api.put<Marking>(`/api/markings/${id}`, data);
    return normalizeMarking(response.data);
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/api/markings/${id}`);
  },
};

export const cadastreService = {
  searchByPropertyCode: async (propertyCode: string): Promise<CadastreFeature> => {
    const response = await api.get<CadastreFeature>(
      `/api/cadastre/search/${encodeURIComponent(propertyCode)}`
    );
    return response.data;
  },

  searchByCoordinates: async (lat: number, lng: number): Promise<CadastreFeature | null> => {
    try {
      const response = await api.get<CadastreFeature>(`/api/cadastre/at?lat=${lat}&lng=${lng}`);
      return response.data;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 404 || status === 503) return null;
      throw err;
    }
  },
};

export const mapService = {
  getLayerConfig: async (): Promise<MapLayerConfig> => {
    const response = await api.get<MapLayerConfig>('/api/map/layers');
    return response.data;
  },
};
