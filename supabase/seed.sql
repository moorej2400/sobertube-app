-- SoberTube Seed Data for Development and Testing
-- This file provides sample data for development and testing purposes
-- All data uses recovery-focused content appropriate for the SoberTube platform

-- ==============================================
-- SEED DATA FOR SOBERTUBE DEVELOPMENT
-- ==============================================

-- Insert sample users with recovery-focused profiles
INSERT INTO public.users (id, email, username, display_name, bio, sobriety_date, location, privacy_level) VALUES 
(
    '11111111-1111-1111-1111-111111111111', 
    'sarah.recovery@example.com', 
    'sarahsobriety', 
    'Sarah Johnson', 
    'Mom of two, 3 years sober. Sharing my journey to help others find their path to recovery. One day at a time 💜',
    '2021-03-15',
    'Portland, OR',
    'public'
),
(
    '22222222-2222-2222-2222-222222222222', 
    'mike.warrior@example.com', 
    'mikewarrior', 
    'Mike Thompson', 
    'Recovery coach and advocate. 7 years clean from opioids. Here to support and share hope with others in recovery.',
    '2017-08-22',
    'Austin, TX',
    'public'
),
(
    '33333333-3333-3333-3333-333333333333', 
    'elena.hope@example.com', 
    'elenahope', 
    'Elena Rodriguez', 
    'Artist in recovery. 2 years sober from alcohol. Finding creativity and purpose in sobriety. 🎨✨',
    '2022-01-10',
    'Denver, CO',
    'public'
),
(
    '44444444-4444-4444-4444-444444444444', 
    'david.strength@example.com', 
    'davidstrong', 
    'David Chen', 
    'Fitness enthusiast and recovery mentor. 5 years sober. Believe in the power of community and healthy living.',
    '2019-06-30',
    'Seattle, WA',
    'public'
),
(
    '55555555-5555-5555-5555-555555555555', 
    'jamie.journey@example.com', 
    'jamiejourney', 
    'Jamie Williams', 
    'Early recovery (90 days clean). Learning, growing, and grateful for each day. Looking for community and support.',
    '2024-05-08',
    'Nashville, TN',
    'community'
);

-- Insert sample posts with recovery-focused content
INSERT INTO public.posts (id, user_id, content, post_type, status) VALUES 
(
    'post-1111-1111-1111-111111111111', 
    '11111111-1111-1111-1111-111111111111', 
    'Today marks 1,095 days of sobriety! Three years ago I never thought I could make it this far. To anyone in early recovery reading this - you CAN do this. Take it one day at a time, lean on your support system, and remember that recovery is possible. Grateful for this community! 🙏',
    'Recovery Milestone',
    'published'
),
(
    'post-2222-2222-2222-222222222222', 
    '22222222-2222-2222-2222-222222222222', 
    'Had a difficult day today with cravings hitting hard. Instead of using, I called my sponsor, went for a run, and remembered all the reasons I chose recovery. The urge passed. For anyone struggling today - reach out, use your tools, and remember that feelings pass but recovery lasts. You are stronger than you know.',
    'Daily Reflection',
    'published'
),
(
    'post-3333-3333-3333-333333333333', 
    '33333333-3333-3333-3333-333333333333', 
    'Creating art has become such an important part of my recovery journey. When I was drinking, I thought I needed alcohol to be creative. Turns out, sobriety has unlocked creativity I never knew I had. Just finished a painting that represents my journey from darkness to light. Art heals. 🎨',
    'Recovery Update',
    'published'
),
(
    'post-4444-4444-4444-444444444444', 
    '44444444-4444-4444-4444-444444444444', 
    'Reminder: Recovery is not a destination, it''s a daily practice. Today I practiced gratitude, mindfulness, and service to others. I hit the gym, checked in with a friend in early recovery, and spent time in nature. What did you do for your recovery today? Share below! 💪',
    'Daily Reflection',
    'published'
),
(
    'post-5555-5555-5555-555555555555', 
    '55555555-5555-5555-5555-555555555555', 
    'Day 90! Three months clean feels like a huge victory. I know I have a long way to go, but I''m learning to celebrate the small wins. Today I woke up without a hangover, I remembered my conversations from yesterday, and I felt present with my family. These things matter. Thank you all for the support!',
    'Recovery Milestone',
    'published'
),
(
    'post-6666-6666-6666-666666666666', 
    '22222222-2222-2222-2222-222222222222', 
    'Recovery tip Tuesday: Build a strong morning routine. For me, it''s meditation, gratitude journaling, and setting intentions for the day. This grounds me and helps me stay centered no matter what challenges come up. What''s in your morning routine? Let''s share ideas to support each other! ☀️',
    'Tips and Advice',
    'published'
);

-- Insert sample videos (placeholder entries - actual video files would be handled separately)
INSERT INTO public.videos (id, user_id, title, description, status, duration, file_size, media_format) VALUES 
(
    'video-1111-1111-1111-111111111111', 
    '11111111-1111-1111-1111-111111111111', 
    'My 3-Year Recovery Story', 
    'Sharing my journey from addiction to recovery. The ups, downs, and everything in between. Hope this helps someone who needs to hear it today.',
    'published',
    300,
    15728640,
    'mp4'
),
(
    'video-2222-2222-2222-222222222222', 
    '22222222-2222-2222-2222-222222222222', 
    'Dealing with Cravings: 5 Tools That Work', 
    'Practical strategies for managing cravings when they hit. These techniques have helped me stay clean for 7 years.',
    'published',
    180,
    9437184,
    'mp4'
),
(
    'video-3333-3333-3333-333333333333', 
    '33333333-3333-3333-3333-333333333333', 
    'Art Therapy in Recovery', 
    'How I use painting and creativity as part of my recovery toolkit. Including a time-lapse of creating my latest piece.',
    'published',
    240,
    12582912,
    'mp4'
);

-- Insert sample likes to show social engagement
INSERT INTO public.likes (user_id, content_type, content_id) VALUES 
-- Sarah likes Mike's post about cravings
('11111111-1111-1111-1111-111111111111', 'post', 'post-2222-2222-2222-222222222222'),
-- Mike likes Sarah's milestone post
('22222222-2222-2222-2222-222222222222', 'post', 'post-1111-1111-1111-111111111111'),
-- Elena likes David's daily practice post
('33333333-3333-3333-3333-333333333333', 'post', 'post-4444-4444-4444-444444444444'),
-- David likes Jamie's 90-day milestone
('44444444-4444-4444-4444-444444444444', 'post', 'post-5555-5555-5555-555555555555'),
-- Jamie likes Sarah's recovery story video
('55555555-5555-5555-5555-555555555555', 'video', 'video-1111-1111-1111-111111111111'),
-- Sarah likes Elena's art therapy video
('11111111-1111-1111-1111-111111111111', 'video', 'video-3333-3333-3333-333333333333'),
-- Mike likes his own tips video (author can like their content)
('22222222-2222-2222-2222-222222222222', 'video', 'video-2222-2222-2222-222222222222');

-- Insert sample comments showing supportive community interaction
INSERT INTO public.comments (user_id, content_type, content_id, content, parent_comment_id) VALUES 
-- Comments on Sarah's milestone post
(
    '22222222-2222-2222-2222-222222222222', 
    'post', 
    'post-1111-1111-1111-111111111111', 
    'Congratulations Sarah! 3 years is incredible. Your story gives me hope and reminds me why I stay in recovery. Thank you for sharing your journey with us! 🎉',
    NULL
),
(
    '33333333-3333-3333-3333-333333333333', 
    'post', 
    'post-1111-1111-1111-111111111111', 
    'This is so inspiring! I''m at 2 years and posts like this remind me to keep going. One day at a time indeed! 💜',
    NULL
),
-- Sarah replies to Elena's comment
(
    '11111111-1111-1111-1111-111111111111', 
    'post', 
    'post-1111-1111-1111-111111111111', 
    'Thank you Elena! Your art has been such an inspiration to me. Recovery looks different for everyone but community makes it possible. Keep creating! 🎨',
    NULL
),
-- Comments on Mike's cravings post
(
    '55555555-5555-5555-5555-555555555555', 
    'post', 
    'post-2222-2222-2222-222222222222', 
    'I needed to read this today. Had some tough moments yesterday but remembered to use my tools just like you said. Thank you for the reminder that feelings pass!',
    NULL
),
(
    '44444444-4444-4444-4444-444444444444', 
    'post', 
    'post-2222-2222-2222-222222222222', 
    'Great advice Mike. The part about calling your sponsor resonates with me. Connection is so important when cravings hit. Thanks for the vulnerability.',
    NULL
),
-- Comment on Jamie's 90-day milestone
(
    '11111111-1111-1111-1111-111111111111', 
    'post', 
    'post-5555-5555-5555-555555555555', 
    'Way to go Jamie! 90 days is HUGE. Those small wins you mentioned are actually big wins - being present with family is everything. Keep celebrating each day! 🎉',
    NULL
);

-- Insert sample follows to create social connections
INSERT INTO public.follows (follower_id, following_id) VALUES 
-- Everyone follows Mike (he's a recovery coach)
('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222'),
('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222'),
('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222'),
-- Sarah and Elena follow each other (mutual support)
('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333'),
('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111'),
-- David follows Sarah and Mike
('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111'),
-- Sarah follows David
('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444'),
-- Jamie (early recovery) follows experienced members
('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111'),
('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333'),
('55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444'),
-- Established members support Jamie
('22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555'),
('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555');

-- Display seed data summary
SELECT 
    'SEED DATA SUMMARY' as summary,
    (SELECT COUNT(*) FROM users) as users_created,
    (SELECT COUNT(*) FROM posts) as posts_created,
    (SELECT COUNT(*) FROM videos) as videos_created,
    (SELECT COUNT(*) FROM likes) as likes_created,
    (SELECT COUNT(*) FROM comments) as comments_created,
    (SELECT COUNT(*) FROM follows) as follows_created,
    NOW() as seeded_at;

-- Display sample feed data to verify functionality
SELECT 
    'SAMPLE FEED VERIFICATION' as verification_type,
    'Feed items should appear below' as note;