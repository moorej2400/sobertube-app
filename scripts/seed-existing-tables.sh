#!/bin/bash

# Apply seed data to existing SoberTube tables (users and posts only)
# This script manually applies seed data for tables that currently exist

set -e

echo "🌱 Applying SoberTube seed data to existing tables..."
echo "================================================="

# Configuration
API_URL="http://localhost:57891/rest/v1"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

# Function to make API calls
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    
    echo "Making $method request to $endpoint..."
    
    curl -X "$method" \
         "$API_URL/$endpoint" \
         -H "apikey: $SERVICE_KEY" \
         -H "Authorization: Bearer $SERVICE_KEY" \
         -H "Content-Type: application/json" \
         -H "Prefer: return=minimal" \
         -d "$data" \
         -s -w "\nHTTP Status: %{http_code}\n"
}

echo "📝 Inserting sample users..."

# Insert users (fixed privacy_level to use 'private' instead of 'community')
api_call "POST" "users" '[
{
    "id": "11111111-1111-1111-1111-111111111111",
    "email": "sarah.recovery@example.com",
    "username": "sarahsobriety",
    "display_name": "Sarah Johnson",
    "bio": "Mom of two, 3 years sober. Sharing my journey to help others find their path to recovery. One day at a time 💜",
    "sobriety_date": "2021-03-15",
    "location": "Portland, OR",
    "privacy_level": "public"
},
{
    "id": "22222222-2222-2222-2222-222222222222",
    "email": "mike.warrior@example.com",
    "username": "mikewarrior",
    "display_name": "Mike Thompson",
    "bio": "Recovery coach and advocate. 7 years clean from opioids. Here to support and share hope with others in recovery.",
    "sobriety_date": "2017-08-22",
    "location": "Austin, TX",
    "privacy_level": "public"
},
{
    "id": "33333333-3333-3333-3333-333333333333",
    "email": "elena.hope@example.com",
    "username": "elenahope",
    "display_name": "Elena Rodriguez",
    "bio": "Artist in recovery. 2 years sober from alcohol. Finding creativity and purpose in sobriety. 🎨✨",
    "sobriety_date": "2022-01-10",
    "location": "Denver, CO",
    "privacy_level": "public"
},
{
    "id": "44444444-4444-4444-4444-444444444444",
    "email": "david.strength@example.com",
    "username": "davidstrong",
    "display_name": "David Chen",
    "bio": "Fitness enthusiast and recovery mentor. 5 years sober. Believe in the power of community and healthy living.",
    "sobriety_date": "2019-06-30",
    "location": "Seattle, WA",
    "privacy_level": "public"
},
{
    "id": "55555555-5555-5555-5555-555555555555",
    "email": "jamie.journey@example.com",
    "username": "jamiejourney",
    "display_name": "Jamie Williams",
    "bio": "Early recovery (90 days clean). Learning, growing, and grateful for each day. Looking for community and support.",
    "sobriety_date": "2024-05-08",
    "location": "Nashville, TN",
    "privacy_level": "private"
}]'

echo ""
echo "📄 Inserting sample posts..."

# Insert posts (using proper UUIDs)
api_call "POST" "posts" '[
{
    "id": "11111111-2222-3333-4444-555555555555",
    "user_id": "11111111-1111-1111-1111-111111111111",
    "content": "Today marks 1,095 days of sobriety! Three years ago I never thought I could make it this far. To anyone in early recovery reading this - you CAN do this. Take it one day at a time, lean on your support system, and remember that recovery is possible. Grateful for this community! 🙏",
    "post_type": "Milestone"
},
{
    "id": "22222222-3333-4444-5555-666666666666",
    "user_id": "22222222-2222-2222-2222-222222222222",
    "content": "Had a difficult day today with cravings hitting hard. Instead of using, I called my sponsor, went for a run, and remembered all the reasons I chose recovery. The urge passed. For anyone struggling today - reach out, use your tools, and remember that feelings pass but recovery lasts. You are stronger than you know.",
    "post_type": "Recovery Update"
},
{
    "id": "33333333-4444-5555-6666-777777777777",
    "user_id": "33333333-3333-3333-3333-333333333333",
    "content": "Creating art has become such an important part of my recovery journey. When I was drinking, I thought I needed alcohol to be creative. Turns out, sobriety has unlocked creativity I never knew I had. Just finished a painting that represents my journey from darkness to light. Art heals. 🎨",
    "post_type": "Recovery Update"
},
{
    "id": "44444444-5555-6666-7777-888888888888",
    "user_id": "44444444-4444-4444-4444-444444444444",
    "content": "Reminder: Recovery is not a destination, it is a daily practice. Today I practiced gratitude, mindfulness, and service to others. I hit the gym, checked in with a friend in early recovery, and spent time in nature. What did you do for your recovery today? Share below! 💪",
    "post_type": "Recovery Update"
},
{
    "id": "55555555-6666-7777-8888-999999999999",
    "user_id": "55555555-5555-5555-5555-555555555555",
    "content": "Day 90! Three months clean feels like a huge victory. I know I have a long way to go, but I am learning to celebrate the small wins. Today I woke up without a hangover, I remembered my conversations from yesterday, and I felt present with my family. These things matter. Thank you all for the support!",
    "post_type": "Milestone"
}]'

echo ""
echo "📊 Checking seed data results..."

# Verify the data was inserted
echo "Users count:"
curl -X GET "$API_URL/users?select=count" -H "apikey: $SERVICE_KEY" -s

echo ""
echo "Sample users:"
curl -X GET "$API_URL/users?select=username,display_name,bio&limit=3" -H "apikey: $SERVICE_KEY" -s

echo ""
echo "Posts count:"
curl -X GET "$API_URL/posts?select=count" -H "apikey: $SERVICE_KEY" -s

echo ""
echo "Sample posts:"
curl -X GET "$API_URL/posts?select=content,post_type&limit=2" -H "apikey: $SERVICE_KEY" -s

echo ""
echo "🎉 Seed data application complete for existing tables!"
echo "✅ Users and Posts tables now have sample data"
echo "⏳ Additional tables (videos, likes, comments, follows) will be seeded after migrations are complete"