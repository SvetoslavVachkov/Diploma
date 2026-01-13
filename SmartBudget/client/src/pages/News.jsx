import React, { useState, useEffect } from 'react';
import api from '../services/api';

const News = () => {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchArticles();
  }, [page]);

  const fetchArticles = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/news/articles?page=${page}&limit=20&sort_by=published_at&sort_order=DESC`);
      if (response.data.status === 'success') {
        const articlesData = response.data.data || [];
        const seenTitles = new Set();
        const uniqueArticles = articlesData.filter(article => {
          if (!article || !article.title) return false;
          const normalizedTitle = article.title.toLowerCase().trim();
          if (seenTitles.has(normalizedTitle)) {
            return false;
          }
          seenTitles.add(normalizedTitle);
          return true;
        });
        setArticles(uniqueArticles);
        setTotalPages(response.data.pagination?.pages || 1);
      }
    } catch (error) {
      setArticles([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading && articles.length === 0) {
    return <div style={styles.loading}>Зареждане...</div>;
  }

  return (
    <div>
      <h1 style={styles.title}>Новини</h1>
      {articles.length > 0 ? (
        <>
          <div style={styles.articlesGrid}>
            {articles.map((article) => (
              <a
                key={article.id}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.articleCard}
              >
                {article.image_url && (
                  <img src={article.image_url} alt={article.title} style={styles.articleImage} />
                )}
                <div style={styles.articleContent}>
                  <h3 style={styles.articleTitle}>{article.title}</h3>
                  {article.excerpt && (
                    <p style={styles.articleExcerpt}>{article.excerpt.substring(0, 200)}...</p>
                  )}
                  <div style={styles.articleMeta}>
                    <span style={styles.articleDate}>
                      {article.published_at
                        ? new Date(article.published_at).toLocaleDateString('bg-BG')
                        : ''}
                    </span>
                    {article.source_name && (
                      <span style={styles.articleSource}>{article.source_name}</span>
                    )}
                  </div>
                </div>
              </a>
            ))}
          </div>
          {totalPages > 1 && (
            <div style={styles.pagination}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={styles.paginationButton}
              >
                Предишна
              </button>
              <span style={styles.paginationInfo}>
                Страница {page} от {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={styles.paginationButton}
              >
                Следваща
              </button>
            </div>
          )}
        </>
      ) : (
        <div style={styles.empty}>
          <p>Няма налични новини</p>
        </div>
      )}
    </div>
  );
};

const styles = {
  title: {
    fontSize: '36px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '32px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text'
  },
  loading: {
    textAlign: 'center',
    color: '#666',
    fontSize: '18px',
    padding: '60px'
  },
  articlesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: '24px',
    marginBottom: '32px'
  },
  articleCard: {
    background: 'white',
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
    textDecoration: 'none',
    color: 'inherit',
    display: 'flex',
    flexDirection: 'column',
    transition: 'all 0.3s ease',
    border: '1px solid rgba(102, 126, 234, 0.1)'
  },
  articleImage: {
    width: '100%',
    height: '200px',
    objectFit: 'cover'
  },
  articleContent: {
    padding: '20px',
    flex: 1,
    display: 'flex',
    flexDirection: 'column'
  },
  articleTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '12px',
    lineHeight: '1.4'
  },
  articleExcerpt: {
    fontSize: '14px',
    color: '#6b7280',
    lineHeight: '1.6',
    marginBottom: '16px',
    flex: 1
  },
  articleMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '12px',
    color: '#9ca3af'
  },
  articleDate: {
    fontWeight: '500'
  },
  articleSource: {
    fontWeight: '600'
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '20px',
    marginTop: '40px'
  },
  paginationButton: {
    padding: '10px 20px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.3s'
  },
  paginationInfo: {
    fontSize: '14px',
    color: '#666',
    fontWeight: '500'
  },
  empty: {
    textAlign: 'center',
    color: '#666',
    padding: '60px',
    fontSize: '18px'
  }
};

export default News;

