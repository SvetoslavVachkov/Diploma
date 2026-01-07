import React, { useState, useEffect } from 'react';
import api from '../services/api';

const News = () => {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState(null);

  useEffect(() => {
    fetchArticles();
  }, []);

  const fetchArticles = async () => {
    try {
      setLoading(true);
      const response = await api.get('/news/articles');
      if (response.data.status === 'success') {
        setArticles(response.data.data || []);
        if (response.data.message) {
          console.log(response.data.message);
        }
      }
    } catch (error) {
      console.error('Failed to fetch articles:', error);
      alert('Грешка при зареждане на новини: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleArticleClick = async (articleId) => {
    try {
      const response = await api.get(`/news/articles/${articleId}`);
      if (response.data.status === 'success') {
        setSelectedArticle(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch article:', error);
    }
  };

  if (loading) {
    return <div style={styles.loading}>Зареждане на важни новини...</div>;
  }

  if (selectedArticle) {
    return (
      <div style={styles.container}>
        <button onClick={() => setSelectedArticle(null)} style={styles.backButton}>
          ← Назад
        </button>
        <div style={styles.articleDetail}>
          <h1 style={styles.articleTitle}>{selectedArticle.title}</h1>
          {selectedArticle.source && (
            <div style={styles.sourceInfo}>
              <span>{selectedArticle.source.name}</span>
              {selectedArticle.published_at && (
                <span>{new Date(selectedArticle.published_at).toLocaleDateString('bg-BG')}</span>
              )}
            </div>
          )}
          {selectedArticle.image_url && (
            <img src={selectedArticle.image_url} alt={selectedArticle.title} style={styles.articleImage} />
          )}
          {selectedArticle.excerpt && (
            <p style={styles.excerpt}>{selectedArticle.excerpt}</p>
          )}
          {selectedArticle.content && (
            <div style={styles.content} dangerouslySetInnerHTML={{ __html: selectedArticle.content }} />
          )}
          {selectedArticle.url && (
            <a href={selectedArticle.url} target="_blank" rel="noopener noreferrer" style={styles.readMore}>
              Прочети пълния текст →
            </a>
          )}
          {selectedArticle.importance && (
            <div style={styles.importanceBadge}>
              Важност: {selectedArticle.importance.score}/100
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Важни новини</h1>
      {articles.length === 0 ? (
        <div style={styles.empty}>
          <p>Няма новини в момента.</p>
          <p style={styles.emptyHint}>
            Възможни причини:
            <br />• Няма импортирани статии в базата данни
            <br />• AI филтърът е твърде строг (добавете HF_NEWS_API_KEY в .env)
            <br />• Статиите не са оценени като важни
          </p>
        </div>
      ) : (
        <div style={styles.articlesList}>
          {articles.map((article) => (
            <div
              key={article.id}
              style={styles.articleCard}
              onClick={() => handleArticleClick(article.id)}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
              }}
            >
              {article.image_url && (
                <img src={article.image_url} alt={article.title} style={styles.cardImage} />
              )}
              <div style={styles.cardContent}>
                <h2 style={styles.cardTitle}>{article.title}</h2>
                {article.excerpt && (
                  <p style={styles.cardExcerpt}>{article.excerpt.substring(0, 150)}...</p>
                )}
                <div style={styles.cardFooter}>
                  {article.source && (
                    <span style={styles.sourceName}>{article.source.name}</span>
                  )}
                  {article.published_at && (
                    <span style={styles.publishDate}>
                      {new Date(article.published_at).toLocaleDateString('bg-BG')}
                    </span>
                  )}
                  {article.importance && (
                    <span style={styles.importanceScore}>
                      ⭐ {article.importance.score}/100
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    padding: '20px',
    maxWidth: '1200px',
    margin: '0 auto'
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    marginBottom: '30px',
    color: '#1f2937'
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    fontSize: '18px',
    color: '#666'
  },
  empty: {
    textAlign: 'center',
    padding: '40px',
    fontSize: '16px',
    color: '#666'
  },
  emptyHint: {
    marginTop: '20px',
    fontSize: '14px',
    color: '#999',
    lineHeight: '1.8'
  },
  articlesList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: '20px'
  },
  articleCard: {
    background: 'white',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s'
  },
  cardImage: {
    width: '100%',
    height: '200px',
    objectFit: 'cover'
  },
  cardContent: {
    padding: '20px'
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '10px',
    color: '#1f2937',
    lineHeight: '1.4'
  },
  cardExcerpt: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '15px',
    lineHeight: '1.5'
  },
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '12px',
    color: '#999'
  },
  sourceName: {
    fontWeight: '500'
  },
  publishDate: {},
  importanceScore: {
    background: '#fef3c7',
    padding: '4px 8px',
    borderRadius: '4px',
    fontWeight: '600',
    color: '#92400e'
  },
  backButton: {
    padding: '10px 20px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    marginBottom: '20px',
    fontWeight: '500'
  },
  articleDetail: {
    background: 'white',
    borderRadius: '12px',
    padding: '40px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  },
  articleTitle: {
    fontSize: '32px',
    fontWeight: 'bold',
    marginBottom: '20px',
    color: '#1f2937',
    lineHeight: '1.3'
  },
  sourceInfo: {
    display: 'flex',
    gap: '20px',
    marginBottom: '20px',
    fontSize: '14px',
    color: '#666'
  },
  articleImage: {
    width: '100%',
    maxHeight: '400px',
    objectFit: 'cover',
    borderRadius: '8px',
    marginBottom: '20px'
  },
  excerpt: {
    fontSize: '18px',
    color: '#374151',
    marginBottom: '20px',
    lineHeight: '1.6',
    fontStyle: 'italic'
  },
  content: {
    fontSize: '16px',
    color: '#1f2937',
    lineHeight: '1.8',
    marginBottom: '20px'
  },
  readMore: {
    display: 'inline-block',
    padding: '12px 24px',
    background: '#667eea',
    color: 'white',
    textDecoration: 'none',
    borderRadius: '8px',
    fontWeight: '500',
    marginTop: '20px'
  },
  importanceBadge: {
    display: 'inline-block',
    marginTop: '20px',
    padding: '8px 16px',
    background: '#fef3c7',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#92400e'
  }
};

export default News;

