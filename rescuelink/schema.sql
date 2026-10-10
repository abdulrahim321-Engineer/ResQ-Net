-- RescueLink schema v3. Supabase -> SQL Editor -> paste -> Run.
-- Only our server (secret/service-role key) touches these tables. RLS on + no policies = locked to everyone else.

create extension if not exists "pgcrypto";

create table if not exists accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('citizen','hospital','ambulance')),
  display_name text not null,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists citizen_profiles (
  user_id uuid primary key references accounts(id) on delete cascade,
  cnic text unique not null,
  cnic_source text not null default 'typed' check (cnic_source in ('typed','scanned')),
  full_name text not null,
  date_of_birth date,
  gender text,
  blood_group text,
  conditions text[] not null default '{}',
  allergies text[] not null default '{}',
  medications text[] not null default '{}',
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_email text,
  emergency_contact_relation text,
  updated_at timestamptz not null default now()
);

create table if not exists hospitals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid unique references accounts(id) on delete set null,
  osm_id text unique,
  source text not null default 'osm' check (source in ('osm','registered')),
  name text not null,
  address text,
  phone text,
  lat double precision not null,
  lng double precision not null,
  capabilities text[] not null default '{general}',
  er_beds_available int,
  accepting boolean not null default true,
  updated_at timestamptz
);

create table if not exists ambulances (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid unique not null references accounts(id) on delete cascade,
  call_sign text not null,
  service_name text not null,
  vehicle_type text not null check (vehicle_type in ('ALS','BLS')),
  plate text,
  status text not null default 'offline' check (status in ('offline','available','assigned','busy')),
  lat double precision,
  lng double precision,
  last_seen_at timestamptz,
  current_incident_id uuid
);

create sequence if not exists incident_ref_seq start 1001;

create table if not exists incidents (
  id uuid primary key default gen_random_uuid(),
  ref_code text not null default ('EMR-' || nextval('incident_ref_seq')),
  status text not null default 'assigned',
  created_at timestamptz not null default now(),
  lat double precision not null,
  lng double precision not null,
  address text,
  description text not null,
  reporter_id uuid references accounts(id) on delete set null,
  reporter_name text,
  reporter_phone text,
  patient_user_id uuid references citizen_profiles(user_id) on delete set null,
  identity_status text not null default 'unknown',
  triage jsonb,
  brief jsonb,
  relative_message text,
  ambulance_id uuid references ambulances(id) on delete set null,
  hospital_id uuid references hospitals(id) on delete set null,
  dispatch_decision jsonb,
  hospital_decision jsonb,
  declined_ambulance_ids uuid[] not null default '{}',
  assigned_at timestamptz,
  accepted_at timestamptz,
  at_scene_at timestamptz,
  picked_up_at timestamptz,
  arrived_at timestamptz,
  hospital_readiness text not null default 'pending',
  hospital_acknowledged_at timestamptz
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid references incidents(id) on delete cascade,
  channel text not null,
  recipient text not null,
  message text not null,
  whatsapp_link text,
  delivered boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);

alter table accounts enable row level security;
alter table citizen_profiles enable row level security;
alter table hospitals enable row level security;
alter table ambulances enable row level security;
alter table incidents enable row level security;
alter table notifications enable row level security;
