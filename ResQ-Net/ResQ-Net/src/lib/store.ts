'use client';

// Global store using localStorage & CustomEvents for cross-tab live synchronization
export interface Hospital {
  id: string;
  name: string;
  lat: number;
  lng: number;
  beds: number;
}

export interface Ambulance {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: 'available' | 'busy';
  hospitalId: string;
}

export interface ActiveIncident {
  id: string;
  status: 'reported' | 'dispatched' | 'en_route_patient' | 'patient_onboard' | 'en_route_hospital' | 'arrived_er';
  createdAt: string;
  patient: {
    name: string;
    cnic: string;
    bloodGroup: string;
    phone: string;
    allergies: string;
    cnicImageBase64?: string;
  };
  location: {
    address: string;
    lat: number;
    lng: number;
  };
  assignedAmbulanceId: string;
  assignedAmbulanceName: string;
  driverName?: string;
  driverPhone?: string;
  ambulanceLocation: {
    lat: number;
    lng: number;
  };
  assignedHospitalId: string;
  assignedHospitalName: string;
  hospitalAlerted: boolean;
  alertSentAt?: string;
  hospitalBayStatus: 'standby' | 'preparing_bay' | 'bay_ready';
  etaSeconds: number;
  history: Array<{ timestamp: string; title: string; subtitle: string }>;
}

const HOSPITALS_KEY = 'resqnet_hospitals';
const AMBULANCES_KEY = 'resqnet_ambulances';
const ACTIVE_INCIDENT_KEY = 'resqnet_active_incident';
const INCIDENT_EVENT_NAME = 'resqnet_incident_update';

const defaultHospitals: Hospital[] = [
  { id: 'h1', name: 'PIMS Emergency Center', lat: 33.7182, lng: 73.0607, beds: 45 },
  { id: 'h2', name: 'Shifa International ER', lat: 33.7295, lng: 73.0425, beds: 30 },
  { id: 'h3', name: 'Polyclinic Emergency Hospital', lat: 33.7200, lng: 73.0700, beds: 18 },
  { id: 'h4', name: 'Kulsum International ER', lat: 33.7110, lng: 73.0550, beds: 25 },
];

const defaultAmbulances: Ambulance[] = [
  { id: 'a1', name: 'AMB-04 (ALS Unit)', lat: 33.7220, lng: 73.0541, status: 'available', hospitalId: 'h1' },
  { id: 'a2', name: 'AMB-07 (BLS Unit)', lat: 33.7145, lng: 73.0490, status: 'busy', hospitalId: 'h2' },
  { id: 'a3', name: 'AMB-11 (ALS Unit)', lat: 33.7260, lng: 73.0580, status: 'available', hospitalId: 'h1' },
];

const defaultIncident: ActiveIncident = {
  id: 'INC-2026-8809',
  status: 'reported',
  createdAt: new Date().toLocaleTimeString(),
  patient: {
    name: 'Tariq Mahmood',
    cnic: '35202-1928374-1',
    bloodGroup: 'B+',
    phone: '+92 300 5551234',
    allergies: 'Penicillin, Severe Aspirin sensitivity',
    cnicImageBase64: '',
  },
  location: {
    address: 'F-8 Markaz Junction, Islamabad',
    lat: 33.7184,
    lng: 73.0600,
  },
  assignedAmbulanceId: 'a1',
  assignedAmbulanceName: 'AMB-04 (ALS Unit)',
  driverName: 'Captain Zahid Khan',
  driverPhone: '+92 312 9876543',
  ambulanceLocation: {
    lat: 33.7220,
    lng: 73.0541,
  },
  assignedHospitalId: 'h1',
  assignedHospitalName: 'PIMS Emergency Center',
  hospitalAlerted: true,
  alertSentAt: new Date().toLocaleTimeString(),
  hospitalBayStatus: 'preparing_bay',
  etaSeconds: 240,
  history: [
    { timestamp: new Date().toLocaleTimeString(), title: 'SOS Emergency Received', subtitle: 'Location verified via Sat-Link (F-8 Markaz)' },
    { timestamp: new Date().toLocaleTimeString(), title: 'CNIC ID Scanned', subtitle: 'Tariq Mahmood · B+ · Medical Alert: Penicillin' },
    { timestamp: new Date().toLocaleTimeString(), title: 'Alert Transmitted to PIMS Emergency Center', subtitle: 'Driver Capt. Zahid Khan sent live location & patient record' },
  ],
};

export function getHospitals(): Hospital[] {
  if (typeof window === 'undefined') return defaultHospitals;
  const stored = localStorage.getItem(HOSPITALS_KEY);
  return stored ? JSON.parse(stored) : defaultHospitals;
}

export function saveHospitals(hospitals: Hospital[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(HOSPITALS_KEY, JSON.stringify(hospitals));
}

export function getAmbulances(): Ambulance[] {
  if (typeof window === 'undefined') return defaultAmbulances;
  const stored = localStorage.getItem(AMBULANCES_KEY);
  return stored ? JSON.parse(stored) : defaultAmbulances;
}

export function saveAmbulances(ambulances: Ambulance[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AMBULANCES_KEY, JSON.stringify(ambulances));
}

export function getActiveIncident(): ActiveIncident {
  if (typeof window === 'undefined') return defaultIncident;
  const stored = localStorage.getItem(ACTIVE_INCIDENT_KEY);
  return stored ? JSON.parse(stored) : defaultIncident;
}

export function saveActiveIncident(incident: ActiveIncident) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACTIVE_INCIDENT_KEY, JSON.stringify(incident));
  window.dispatchEvent(new CustomEvent(INCIDENT_EVENT_NAME, { detail: incident }));
}

export function subscribeToIncident(callback: (incident: ActiveIncident) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleCustom = (e: Event) => {
    const custom = e as CustomEvent<ActiveIncident>;
    if (custom.detail) callback(custom.detail);
  };

  const handleStorage = (e: StorageEvent) => {
    if (e.key === ACTIVE_INCIDENT_KEY && e.newValue) {
      callback(JSON.parse(e.newValue));
    }
  };

  window.addEventListener(INCIDENT_EVENT_NAME, handleCustom);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(INCIDENT_EVENT_NAME, handleCustom);
    window.removeEventListener('storage', handleStorage);
  };
}

export function resetSystemData(): ActiveIncident {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(ACTIVE_INCIDENT_KEY);
    localStorage.removeItem(HOSPITALS_KEY);
    localStorage.removeItem(AMBULANCES_KEY);
  }
  const fresh: ActiveIncident = {
    ...defaultIncident,
    id: `INC-2026-${Math.floor(1000 + Math.random() * 9000)}`,
    status: 'reported',
    hospitalAlerted: false,
    alertSentAt: undefined,
    hospitalBayStatus: 'standby',
    patient: {
      name: 'New Patient',
      cnic: '35202-0000000-0',
      bloodGroup: 'Pending Scan',
      phone: '',
      allergies: 'No recorded allergies',
      cnicImageBase64: '',
    },
    history: [
      { timestamp: new Date().toLocaleTimeString(), title: 'System Data Reset', subtitle: 'Ready to scan and broadcast new emergency patient payload' }
    ]
  };
  saveActiveIncident(fresh);
  return fresh;
}

export function getNearest<T extends { lat: number; lng: number }>(
  items: T[],
  userLat: number,
  userLng: number
): T | null {
  if (!items.length) return null;
  return items.reduce((nearest, item) => {
    const d = Math.sqrt(Math.pow(item.lat - userLat, 2) + Math.pow(item.lng - userLng, 2));
    const nd = Math.sqrt(Math.pow(nearest.lat - userLat, 2) + Math.pow(nearest.lng - userLng, 2));
    return d < nd ? item : nearest;
  });
}
