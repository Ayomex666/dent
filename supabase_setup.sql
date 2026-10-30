-- ============================================
-- DentaPRO - Supabase Database Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES TABLE (dentists + admin)
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'dentist' CHECK (role IN ('admin', 'dentist')),
  is_blocked BOOLEAN DEFAULT FALSE,
  avatar_url TEXT,
  phone TEXT,
  password_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SERVICES TABLE (per dentist)
-- ============================================
CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dentist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PATIENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.patients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dentist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  age INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- APPOINTMENTS TABLE (visits)
-- ============================================
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  dentist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  visit_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_amount DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- APPOINTMENT SERVICES (many-to-many)
-- ============================================
CREATE TABLE IF NOT EXISTS public.appointment_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  quantity INTEGER DEFAULT 1
);

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dentist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DISABLE RLS (for simplicity with publishable key)
-- ============================================
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.services DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_services DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications DISABLE ROW LEVEL SECURITY;

-- Grant access to anon and authenticated roles
GRANT ALL ON public.profiles TO anon, authenticated;
GRANT ALL ON public.services TO anon, authenticated;
GRANT ALL ON public.patients TO anon, authenticated;
GRANT ALL ON public.appointments TO anon, authenticated;
GRANT ALL ON public.appointment_services TO anon, authenticated;
GRANT ALL ON public.notifications TO anon, authenticated;

-- ============================================
-- INSERT ADMIN PROFILE
-- ============================================
INSERT INTO public.profiles (id, email, full_name, role)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'shukurovayom8@gmail.com',
  'Администратор',
  'admin'
) ON CONFLICT (email) DO NOTHING;

-- ============================================
-- FUNCTION: Auto-generate notifications for patients
-- who haven't visited in 6 months
-- ============================================
CREATE OR REPLACE FUNCTION generate_six_month_notifications()
RETURNS void AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT ON (p.id, p.dentist_id)
      p.id AS patient_id,
      p.dentist_id,
      p.full_name,
      a.visit_date AS last_visit
    FROM public.patients p
    JOIN public.appointments a ON a.patient_id = p.id
    WHERE a.visit_date = (
      SELECT MAX(a2.visit_date)
      FROM public.appointments a2
      WHERE a2.patient_id = p.id
    )
    AND a.visit_date < NOW() - INTERVAL '6 months'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.patient_id = p.id
      AND n.dentist_id = p.dentist_id
      AND n.is_read = FALSE
    )
  LOOP
    INSERT INTO public.notifications (dentist_id, patient_id, message)
    VALUES (
      rec.dentist_id,
      rec.patient_id,
      'Пациент ' || rec.full_name || ' был у вас более 6 месяцев назад. Рекомендуем связаться!'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;
