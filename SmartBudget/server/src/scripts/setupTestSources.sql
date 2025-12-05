
INSERT INTO news_sources (id, name, url, rss_url, language, country, is_active, fetch_interval_minutes, created_at, updated_at) VALUES
(UUID(), 'BBC News', 'https://www.bbc.com', 'https://feeds.bbci.co.uk/news/rss.xml', 'en', 'GB', TRUE, 60, NOW(), NOW()),
(UUID(), 'Reuters', 'https://www.reuters.com', 'https://www.reuters.com/rssFeed/worldNews', 'en', 'US', TRUE, 60, NOW(), NOW()),
(UUID(), 'TechCrunch', 'https://techcrunch.com', 'https://techcrunch.com/feed/', 'en', 'US', TRUE, 120, NOW(), NOW()),
(UUID(), 'The Guardian', 'https://www.theguardian.com', 'https://www.theguardian.com/world/rss', 'en', 'GB', TRUE, 60, NOW(), NOW())
ON DUPLICATE KEY UPDATE updated_at = NOW();


