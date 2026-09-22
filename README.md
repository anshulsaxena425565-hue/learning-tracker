# Learning Tracker

A mobile-first team learning tracker for private YouTube learning playlists, shared progress, profiles, and a team leaderboard.

## Stack
- Single-file HTML/CSS/JavaScript frontend
- Supabase Auth
- Supabase Postgres + Row Level Security
- Supabase RPC functions for team creation, joining, and role management

## Features
- Email + passcode authentication
- Private teams with unique invite codes
- Owner/admin playlist management
- Per-video completion tracking
- Team leaderboard
- Profile, bio, learning goal, avatar URL, and theme preference
- Progress levels: Starter, Learner, Intermediate, Advanced, Master
- Responsive light/dark UI

## Run locally
Serve the repository root with any static HTTP server and open `index.html`. No build step is required.

## Supabase
The browser uses the project's publishable key. No service-role key is included. Database access is protected by Row Level Security.

## Security
- Team members can read team data.
- Only owners/admins can create, update, or delete playlists and playlist videos.
- Only owners can promote/demote admins.
- Users can write only their own video progress and profile.
- Team membership is enforced through RLS and security-definer RPCs.

Never commit service-role keys, passwords, or private credentials.
