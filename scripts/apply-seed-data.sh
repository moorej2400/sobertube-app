#!/bin/bash

# Apply seed data to SoberTube database
# This script manually applies the seed data using the Supabase REST API

set -e

echo "🌱 Applying SoberTube seed data..."
echo "=================================="

# Configuration
API_URL="http://localhost:57891/rest/v1"
API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

# Function to make API calls
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    
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

# Insert users
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
    "privacy_level": "community"
}]'

echo ""
echo "📄 Inserting sample posts..."

# Insert posts
api_call "POST" "posts" '[
{
    "id": "post-1111-1111-1111-111111111111",
    "user_id": "11111111-1111-1111-1111-111111111111",
    "content": "Today marks 1,095 days of sobriety! Three years ago I never thought I could make it this far. To anyone in early recovery reading this - you CAN do this. Take it one day at a time, lean on your support system, and remember that recovery is possible. Grateful for this community! 🙏",
    "post_type": "Recovery Milestone"
},
{
    "id": "post-2222-2222-2222-222222222222",
    "user_id": "22222222-2222-2222-2222-222222222222",
    "content": "Had a difficult day today with cravings hitting hard. Instead of using, I called my sponsor, went for a run, and remembered all the reasons I chose recovery. The urge passed. For anyone struggling today - reach out, use your tools, and remember that feelings pass but recovery lasts. You are stronger than you know.",
    "post_type": "Daily Reflection"
},
{
    "id": "post-3333-3333-3333-333333333333",
    "user_id": "33333333-3333-3333-3333-333333333333",
    "content": "Creating art has become such an important part of my recovery journey. When I was drinking, I thought I needed alcohol to be creative. Turns out, sobriety has unlocked creativity I never knew I had. Just finished a painting that represents my journey from darkness to light. Art heals. 🎨",
    "post_type": "Recovery Update"
}]'

echo ""
echo "🎥 Inserting sample videos..."

# Insert videos
api_call "POST" "videos" '[
{
    "id": "video-1111-1111-1111-111111111111",
    "user_id": "11111111-1111-1111-1111-111111111111",
    "title": "My 3-Year Recovery Story",
    "description": "Sharing my journey from addiction to recovery. The ups, downs, and everything in between. Hope this helps someone who needs to hear it today.",
    "duration": 300,
    "file_size": 15728640,
    "media_format": "mp4"
},
{
    "id": "video-2222-2222-2222-222222222222",
    "user_id": "22222222-2222-2222-2222-222222222222",
    "title": "Dealing with Cravings: 5 Tools That Work",
    "description": "Practical strategies for managing cravings when they hit. These techniques have helped me stay clean for 7 years.",
    "duration": 180,
    "file_size": 9437184,
    "media_format": "mp4"
}]'

echo ""
echo "❤️ Inserting sample likes..."

# Insert likes
api_call "POST" "likes" '[
{
    "user_id": "11111111-1111-1111-1111-111111111111",
    "content_type": "post",
    "content_id": "post-2222-2222-2222-222222222222"
},
{
    "user_id": "22222222-2222-2222-2222-222222222222",
    "content_type": "post",
    "content_id": "post-1111-1111-1111-111111111111"
},
{
    "user_id": "33333333-3333-3333-3333-333333333333",
    "content_type": "video",
    "content_id": "video-1111-1111-1111-111111111111"
}]'

echo ""
echo "💬 Inserting sample comments..."

# Insert comments
api_call "POST" "comments" '[
{
    "user_id": "22222222-2222-2222-2222-222222222222",
    "content_type": "post",
    "content_id": "post-1111-1111-1111-111111111111",
    "content": "Congratulations Sarah! 3 years is incredible. Your story gives me hope and reminds me why I stay in recovery. Thank you for sharing your journey with us! 🎉"
},
{
    "user_id": "33333333-3333-3333-3333-333333333333",
    "content_type": "post",
    "content_id": "post-1111-1111-1111-111111111111",
    "content": "This is so inspiring! I am at 2 years and posts like this remind me to keep going. One day at a time indeed! 💜"
}]'

echo ""
echo "👥 Inserting sample follows..."

# Insert follows
api_call "POST" "follows" '[
{
    "follower_id": "11111111-1111-1111-1111-111111111111",
    "following_id": "22222222-2222-2222-2222-222222222222"
},
{
    "follower_id": "33333333-3333-3333-3333-333333333333",
    "following_id": "11111111-1111-1111-1111-111111111111"
},
{
    "follower_id": "22222222-2222-2222-2222-222222222222",
    "following_id": "33333333-3333-3333-3333-333333333333"
}]'

echo ""
echo "📊 Checking seed data results..."

# Verify the data was inserted
echo "Users count:"
curl -X GET "$API_URL/users?select=count" -H "apikey: $API_KEY" -s

echo ""
echo "Posts count:"
curl -X GET "$API_URL/posts?select=count" -H "apikey: $API_KEY" -s

echo ""  
echo "Videos count:"
curl -X GET "$API_URL/videos?select=count" -H "apikey: $API_KEY" -s

echo ""
echo "Likes count:"
curl -X GET "$API_URL/likes?select=count" -H "apikey: $API_KEY" -s

echo ""
echo "Comments count:"
curl -X GET "$API_URL/comments?select=count" -H "apikey: $API_KEY" -s

echo ""
echo "Follows count:"
curl -X GET "$API_URL/follows?select=count" -H "apikey: $API_KEY" -s

echo ""
echo "🎉 Seed data application complete!"