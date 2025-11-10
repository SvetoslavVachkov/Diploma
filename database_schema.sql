
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    avatar_url TEXT,
    preferences JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE user_sessions (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id VARCHAR(36) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE news_sources (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    rss_url TEXT,
    api_key VARCHAR(255),
    logo_url TEXT,
    description TEXT,
    language VARCHAR(10) DEFAULT 'bg',
    country VARCHAR(10) DEFAULT 'BG',
    category VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    last_fetch_at TIMESTAMP,
    fetch_interval_minutes INT DEFAULT 60,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE news_categories (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    parent_id VARCHAR(36),
    icon VARCHAR(100),
    color VARCHAR(7),

    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES news_categories(id) ON DELETE SET NULL
);

CREATE TABLE news_articles (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    source_id VARCHAR(36) NOT NULL,
    title VARCHAR(500) NOT NULL,
    content TEXT,
    excerpt TEXT,
    url TEXT NOT NULL,
    image_url TEXT,
    published_at TIMESTAMP,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    language VARCHAR(10) DEFAULT 'bg',
    is_processed BOOLEAN DEFAULT FALSE,
    is_ai_summarized BOOLEAN DEFAULT FALSE,
    is_ai_classified BOOLEAN DEFAULT FALSE,
    view_count INT DEFAULT 0,
    share_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (source_id) REFERENCES news_sources(id) ON DELETE CASCADE,
    INDEX idx_published_at (published_at),
    INDEX idx_fetched_at (fetched_at),
    INDEX idx_is_processed (is_processed),
    INDEX idx_title (title(100))
);

CREATE TABLE article_categories (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    article_id VARCHAR(36) NOT NULL,
    category_id VARCHAR(36) NOT NULL,
    confidence_score DECIMAL(3,2) DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (article_id) REFERENCES news_articles(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES news_categories(id) ON DELETE CASCADE,
    UNIQUE KEY unique_article_category (article_id, category_id)
);

CREATE TABLE ai_analysis (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    article_id VARCHAR(36) NOT NULL,
    analysis_type ENUM('sentiment', 'summary', 'classification', 'keywords') NOT NULL,
    result JSON NOT NULL,
    confidence_score DECIMAL(3,2),
    model_name VARCHAR(100),
    processing_time_ms INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (article_id) REFERENCES news_articles(id) ON DELETE CASCADE,
    INDEX idx_analysis_type (analysis_type)
);

CREATE TABLE ai_cache (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    cache_key VARCHAR(255) NOT NULL UNIQUE,
    result JSON NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_expires_at (expires_at)
);

CREATE TABLE user_reading_history (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id VARCHAR(36) NOT NULL,
    article_id VARCHAR(36) NOT NULL,
    read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    time_spent_seconds INT,
    scroll_percentage DECIMAL(5,2),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (article_id) REFERENCES news_articles(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_article (user_id, article_id)
);

CREATE TABLE user_interests (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id VARCHAR(36) NOT NULL,
    category_id VARCHAR(36) NOT NULL,
    weight DECIMAL(3,2) DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES news_categories(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_category (user_id, category_id)
);

CREATE TABLE financial_categories (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(100) NOT NULL,
    type ENUM('income', 'expense') NOT NULL,
    parent_id VARCHAR(36),
    icon VARCHAR(100),
    color VARCHAR(7), -- Hex color code
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES financial_categories(id) ON DELETE SET NULL
);

CREATE TABLE financial_transactions (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id VARCHAR(36) NOT NULL,
    category_id VARCHAR(36) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    description TEXT,
    transaction_date DATE NOT NULL,
    type ENUM('income', 'expense') NOT NULL,
    source VARCHAR(255),
    tags JSON,
    location VARCHAR(255),
    is_recurring BOOLEAN DEFAULT FALSE,
    recurring_pattern JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES financial_categories(id) ON DELETE RESTRICT,
    INDEX idx_user_date (user_id, transaction_date),
    INDEX idx_type_date (type, transaction_date),
    INDEX idx_amount (amount)
);

CREATE TABLE budgets (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id VARCHAR(36) NOT NULL,
    category_id VARCHAR(36) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    period_type ENUM('weekly', 'monthly', 'yearly') NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    spent_amount DECIMAL(15,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES financial_categories(id) ON DELETE CASCADE,
    INDEX idx_user_period (user_id, period_type, start_date)
);

CREATE TABLE financial_goals (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id VARCHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    target_amount DECIMAL(15,2) NOT NULL,
    current_amount DECIMAL(15,2) DEFAULT 0.00,
    target_date DATE,
    goal_type ENUM('savings', 'debt_payoff', 'investment', 'purchase') NOT NULL,
    is_achieved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_goals (user_id, is_achieved)
);

CREATE TABLE system_config (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    `key` VARCHAR(100) NOT NULL UNIQUE,
    value JSON NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE fetch_logs (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    source_id VARCHAR(36) NOT NULL,
    status ENUM('success', 'error', 'warning') NOT NULL,
    articles_fetched INT DEFAULT 0,
    error_message TEXT,
    duration_ms INT,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_id) REFERENCES news_sources(id) ON DELETE CASCADE,
    INDEX idx_fetched_at (fetched_at),
    INDEX idx_status (status)
);

INSERT INTO financial_categories (name, type, is_default) VALUES
('Заплата', 'income', TRUE),
('Бонуси', 'income', TRUE),
('Инвестиции', 'income', TRUE),
('Фрийланс', 'income', TRUE),
('Други приходи', 'income', TRUE),
('Храна', 'expense', TRUE),
('Транспорт', 'expense', TRUE),
('Наем', 'expense', TRUE),
('Комунални', 'expense', TRUE),
('Забавление', 'expense', TRUE),
('Здраве', 'expense', TRUE),
('Образование', 'expense', TRUE),
('Обувки и дрехи', 'expense', TRUE),
('Техника', 'expense', TRUE),
('Други разходи', 'expense', TRUE);

INSERT INTO news_categories (name, slug, description, icon, color) VALUES
('Технологии', 'technology', 'Технологични новини и иновации', 'laptop', '#3B82F6'),
('Политика', 'politics', 'Политически новини и събития', 'government', '#EF4444'),
('Икономика', 'economy', 'Икономически новини и финанси', 'trending-up', '#10B981'),
('Спорт', 'sports', 'Спортни новини и събития', 'activity', '#F59E0B'),
('Здравословни', 'health', 'Здравословни новини и съвети', 'heart', '#EC4899'),
('Образование', 'education', 'Образователни новини и статии', 'book', '#8B5CF6'),
('Култура', 'culture', 'Културни събития и изкуство', 'palette', '#F97316'),
('Свет', 'world', 'Международни новини', 'globe', '#06B6D4'),
('Локални', 'local', 'Локални новини и събития', 'map-pin', '#84CC16');

INSERT INTO news_sources (name, url, rss_url, description, language, country, category, is_active) VALUES
('Дневник', 'https://www.dnevnik.bg', 'https://www.dnevnik.bg/rss', 'Български бизнес вестник', 'bg', 'BG', 'news', TRUE),
('Новинар', 'https://www.novinar.bg', 'https://www.novinar.bg/rss', 'Български новинарски сайт', 'bg', 'BG', 'news', TRUE),
('БТА', 'https://www.bta.bg', 'https://www.bta.bg/bg/rss', 'Българска телеграфна агенция', 'bg', 'BG', 'news', TRUE),
('24 Часа', 'https://www.24chasa.bg', 'https://www.24chasa.bg/rss', 'Български вестник', 'bg', 'BG', 'news', TRUE),
('Нова ТВ', 'https://nova.bg', 'https://nova.bg/rss', 'Българска телевизия', 'bg', 'BG', 'news', TRUE);

INSERT INTO system_config (`key`, value, description) VALUES
('ai_model_config', '{"default_model": "huggingface/distilbert-base-uncased", "sentiment_model": "cardiffnlp/twitter-roberta-base-sentiment-latest", "max_tokens": 512}', 'AI model configuration'),
('news_fetch_interval', '{"default_minutes": 60, "priority_sources_minutes": 30}', 'News fetching intervals'),
('cache_settings', '{"ai_results_hours": 24, "popular_articles_hours": 6}', 'Cache expiration settings'),
('rate_limits', '{"api_requests_per_minute": 100, "ai_requests_per_minute": 10}', 'Rate limiting configuration'),
('app_settings', '{"default_language": "bg", "default_timezone": "Europe/Sofia", "items_per_page": 20}', 'Application settings');