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
          if (seenTitles.has(normalizedTitle)) return false;
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
    return <div className="loading-screen">Зареждане…</div>;
  }

  return (
    <div className="page">
      <h1 className="page-title">Новини</h1>
      {articles.length > 0 ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            {articles.map((article) => (
              <a
                key={article.id}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: 'var(--bg-card)',
                  borderRadius: 'var(--radius-lg)',
                  overflow: 'hidden',
                  boxShadow: 'var(--shadow)',
                  textDecoration: 'none',
                  color: 'inherit',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'box-shadow 0.2s',
                  border: '1px solid var(--border)'
                }}
                onMouseOver={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
                onMouseOut={e => { e.currentTarget.style.boxShadow = 'var(--shadow)'; }}
              >
                {article.image_url && (
                  <img src={article.image_url} alt={article.title} style={{ width: '100%', height: 180, objectFit: 'cover' }} />
                )}
                <div style={{ padding: '1rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', lineHeight: 1.3 }}>{article.title}</h3>
                  {article.excerpt && (
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5, flex: 1, marginBottom: '0.75rem' }}>
                      {article.excerpt.substring(0, 200)}…
                    </p>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span>{article.published_at ? new Date(article.published_at).toLocaleDateString('bg-BG') : ''}</span>
                    {article.source_name && <span style={{ fontWeight: 500 }}>{article.source_name}</span>}
                  </div>
                </div>
              </a>
            ))}
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn btn-secondary"
              >
                Предишна
              </button>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Страница {page} от {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn btn-secondary"
              >
                Следваща
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="empty-state">
          <p>Няма налични новини</p>
        </div>
      )}
    </div>
  );
};

export default News;
