-- Skillforge PostgreSQL Database Schema
-- Phase 1 & Phase 3 Foundational Tables

-- 1. Enable UUID Extension for primary key generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) DEFAULT 'student', -- 'student', 'instructor', 'admin'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast user authentication lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);


-- 3. User Focus Areas (Onboarding Preferences)
CREATE TABLE IF NOT EXISTS user_focus_areas (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    PRIMARY KEY (user_id, category)
);


-- 4. Courses Table (Instructor Studio published courses)
CREATE TABLE IF NOT EXISTS courses (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) DEFAULT 'Web Development',
    thumbnail TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for listing courses newest-first (matches ORDER BY id DESC in app.js)
CREATE INDEX IF NOT EXISTS idx_courses_created_at ON courses(created_at);


-- 5. Enrollments Table
CREATE TABLE IF NOT EXISTS enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    course_id VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'completed'
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, course_id)
);

-- Index for loading user's enrolled courses on the student dashboard
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id);


-- 6. Certificates Table (Automated Certification Pipeline)
CREATE TABLE IF NOT EXISTS certificates (
    certificate_id VARCHAR(50) PRIMARY KEY, -- e.g., SF-2026-88421-NC
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    course_id VARCHAR(100) NOT NULL,
    final_score INT NOT NULL,
    pdf_s3_url TEXT NOT NULL,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for fetching user certificates
CREATE INDEX IF NOT EXISTS idx_certificates_user ON certificates(user_id);