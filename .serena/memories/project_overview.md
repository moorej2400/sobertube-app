# SoberTube Project Overview

## Purpose
SoberTube is a video-first recovery support platform that connects people in recovery through authentic storytelling, peer support, and community building. The MVP focuses on core social features that enable users to share their recovery journey, connect with peers, and build a supportive community.

## Mission
To make recovery education and peer support accessible to everyone through innovative video technology.

## Target Users
- Individuals in recovery (0-5+ years sober)
- People exploring recovery options  
- Family members supporting loved ones in recovery
- Recovery community advocates

## Architecture
- **Backend**: Node.js/TypeScript with Express framework
- **Frontend**: React 18 with TypeScript and Vite
- **Database**: Supabase (PostgreSQL with real-time features)
- **Authentication**: Supabase Auth with JWT tokens
- **Storage**: Supabase Storage for videos and images
- **Deployment**: Docker containers for local development

## Key Features (MVP)
1. User Account Creation & Authentication
2. User Profiles with privacy controls
3. Video Upload & Management (5-minute limit)
4. Timeline/Feed with video playback
5. Posts & Text Content (recovery-focused)
6. Social interactions (likes, comments, shares)

## Current Development Status
The project is implementing Phase 2.2 - Authentication System (Backend). Most authentication features are complete except for session management with refresh tokens.