import api from './api';
import type {
  Property,
  Marking,
  GeoJSONGeometry,
  MarkingType,
  GeometryType,
  CadastreFeature,
  MapLayerConfig,
  ForestValueResponse,
  WorkRequest,
  PublicWorkRequest,
  NewWorkRequest,
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

// PostgreSQL NUMERIC (area_ha) arrives as a string
function normalizeProperty(property: Property): Property {
  return {
    ...property,
    geometry: normalizeGeometry(property.geometry),
    area_ha: normalizeNumber(property.area_ha),
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

  // Always resolves with the same message, whether or not the address has an account
  forgotPassword: async (email: string): Promise<string> => {
    const response = await api.post<{ message: string }>('/api/auth/forgot-password', { email });
    return response.data.message;
  },

  resetPassword: async (token: string, password: string): Promise<string> => {
    const response = await api.post<{ message: string }>('/api/auth/reset-password', { token, password });
    return response.data.message;
  },
};

// Forest properties API calls
export const propertiesService = {
  getAll: async (): Promise<Property[]> => {
    const response = await api.get<Property[]>('/api/properties');
    return response.data.map(normalizeProperty);
  },

  create: async (name: string, geometry: GeoJSONGeometry): Promise<Property> => {
    const response = await api.post<Property>('/api/properties', { name, geometry });
    return normalizeProperty(response.data);
  },

  update: async (id: number, data: Partial<{ name: string; geometry: GeoJSONGeometry }>): Promise<Property> => {
    const response = await api.put<Property>(`/api/properties/${id}`, data);
    return normalizeProperty(response.data);
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
    return normalizeProperty(response.data);
  },

  getMarkings: async (propertyId: number): Promise<Marking[]> => {
    const response = await api.get<Marking[]>(`/api/properties/${propertyId}/markings`);
    return response.data.map(normalizeMarking);
  },

  // refresh = skip the server-side result cache and query Metsäkeskus again
  getForestValue: async (propertyId: number, refresh = false): Promise<ForestValueResponse> => {
    const response = await api.get<ForestValueResponse>(`/api/properties/${propertyId}/forest-value`, {
      params: refresh ? { refresh: 1 } : undefined,
    });
    return response.data;
  },
};

export const forestValueService = {
  // Guest demo parcel, computed from example data on the server
  getDemo: async (): Promise<ForestValueResponse> => {
    const response = await api.get<ForestValueResponse>('/api/forest-value/demo');
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

// PostgreSQL NUMERIC columns (area, euros) arrive as strings
function normalizePublicRequest(r: PublicWorkRequest): PublicWorkRequest {
  return {
    ...r,
    area_ha: normalizeNumber(r.area_ha),
    target_price_eur: normalizeNumber(r.target_price_eur),
    best_bid_eur: normalizeNumber(r.best_bid_eur),
    my_bid_eur: normalizeNumber(r.my_bid_eur),
  };
}

function normalizeOwnRequest(r: WorkRequest): WorkRequest {
  return {
    ...r,
    area_ha: normalizeNumber(r.area_ha),
    target_price_eur: normalizeNumber(r.target_price_eur),
    bid_count: r.bid_count ?? 0,
    best_bid_eur: normalizeNumber(r.best_bid_eur),
  };
}

export const workRequestsService = {
  // Public: open requests for work providers (works without login)
  getOpen: async (type?: MarkingType): Promise<PublicWorkRequest[]> => {
    const response = await api.get<PublicWorkRequest[]>('/api/work-requests', {
      params: type ? { type } : undefined,
    });
    return response.data.map(normalizePublicRequest);
  },
  getMine: async (): Promise<WorkRequest[]> => {
    const response = await api.get<WorkRequest[]>('/api/work-requests/mine');
    return response.data.map(normalizeOwnRequest);
  },
  create: async (data: NewWorkRequest): Promise<WorkRequest> => {
    const response = await api.post<WorkRequest>('/api/work-requests', data);
    return normalizeOwnRequest(response.data);
  },
  // Offer a total price in euros; returns the request with its updated bid summary
  placeBid: async (requestId: number, amountEur: number): Promise<PublicWorkRequest> => {
    const response = await api.post<PublicWorkRequest>(`/api/work-requests/${requestId}/bids`, {
      amount_eur: amountEur,
    });
    return normalizePublicRequest(response.data);
  },
  withdraw: async (id: number): Promise<void> => {
    await api.delete(`/api/work-requests/${id}`);
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
