# Database schema

The Learning Tracker backend uses Supabase Auth plus six public tables.

## Tables
- `profiles`: user profile and preferences
- `teams`: private learning teams and invite codes
- `team_members`: membership and owner/admin/member roles
- `playlists`: playlists belonging to a team
- `playlist_videos`: ordered videos belonging to playlists
- `video_progress`: per-user completion state

## RPCs
- `create_team(text)`
- `join_team_by_code(text)`
- `set_team_member_role(uuid, uuid, text)`

New Auth users receive a profile and a personal team through the Auth trigger.

Row Level Security is enabled on all six tables and scopes access by authenticated identity and team membership.
