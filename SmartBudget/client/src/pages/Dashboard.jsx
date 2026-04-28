import React, { useState, useEffect } from 'react';
import api from '../services/api';
import AiRichText from '../components/AiRichText';

const Dashboard = () => {
  const [summary, setSummary] = useState(null);
  const [advice, setAdvice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adviceLoading, setAdviceLoading] = useState(false);

  useEffect(() => {
    fetchSummary();
    fetchAdvice();
    const interval = setInterval(() => {
      fetchSummary();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchSummary = async () => {
    try {
      const [transactionsRes, summaryRes] = await Promise.all([
        api.get('/financial/transactions?limit=5'),
        api.get('/financial/transactions/summary')
      ]);
      const transactionsData = Array.isArray(transactionsRes.data.data)
        ? transactionsRes.data.data
        : (transactionsRes.data.data?.transactions || []);
      setSummary({
        recent: transactionsData,
        totals: summaryRes.data.data || {}
      });
    } catch (error) {
      setSummary({
        recent: [],
        totals: {}
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchAdvice = async () => {
    try {
      setAdviceLoading(!advice);
      const response = await api.get('/financial/advice?periodDays=365');
      if (response.data.status === 'success') {
        setAdvice(response.data.data);
      }
    } catch (error) {
    } finally {
      setAdviceLoading(false);
    }
  };

  if (loading) {
    return <div className="loading-screen">Зареждане…</div>;
  }

  const income = summary?.totals?.totalIncome ?? summary?.totals?.total_income ?? 0;
  const expense = summary?.totals?.totalExpense ?? summary?.totals?.total_expense ?? summary?.totals?.total_spent ?? 0;
  const balance = summary?.totals?.balance !== undefined ? summary.totals.balance : (income - expense);

  return (
    <div className="page">
      <h1 className="page-title">Начало</h1>
      <div className="cards-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="card">
          <h3 className="card-title">Общо приходи</h3>
          <p className="card-value">{Number(income).toFixed(2)} €</p>
        </div>
        <div className="card">
          <h3 className="card-title">Общо разходи</h3>
          <p className="card-value text-expense">{Number(expense).toFixed(2)} €</p>
        </div>
        <div className="card">
          <h3 className="card-title">Общ баланс</h3>
          <p className="card-value" style={{ color: balance >= 0 ? 'var(--income)' : 'var(--expense)' }}>
            {Number(balance).toFixed(2)} €
          </p>
        </div>
      </div>
      <div className="section">
        <h2 className="section-title">AI Съвети за управление на парите</h2>
        {adviceLoading ? (
          <p className="empty-state">Зареждане на съвети…</p>
        ) : advice?.advice?.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {advice.advice.map((tip, index) => (
              <div
                key={index}
                className="dashboard-ai-card"
              >
                <div className="dashboard-ai-index">{String(index + 1).padStart(2, '0')}</div>
                <div style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.5, flex: 1 }}>
                  <AiRichText content={tip} />
                </div>
              </div>
            ))}
            {advice.spending_summary && (
              <div className="dashboard-ai-summary">
                <div className="dashboard-ai-summary-item">
                  <span className="dashboard-ai-summary-label">Период</span>
                  <strong>365 дни</strong>
                </div>
                <div className="dashboard-ai-summary-item">
                  <span className="dashboard-ai-summary-label">Общо разходи</span>
                  <strong>{Number(advice.spending_summary.total_spent || 0).toFixed(2)} €</strong>
                </div>
                <div className="dashboard-ai-summary-item">
                  <span className="dashboard-ai-summary-label">Средно на ден</span>
                  <strong>{Number(advice.spending_summary.daily_average || 0).toFixed(2)} €</strong>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="empty-state">Няма налични съвети</p>
        )}
      </div>
      <div className="section">
        <h2 className="section-title">Последни транзакции</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {summary?.recent?.length > 0 ? (
            summary.recent.map((tx) => (
              <div
                key={tx.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 1rem',
                  background: 'var(--bg-muted)',
                  borderRadius: 'var(--radius)'
                }}
              >
                <div>
                  <p style={{ fontWeight: 500, marginBottom: '0.25rem' }}>{tx.description}</p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {new Date(tx.transaction_date).toLocaleDateString('bg-BG')}
                  </p>
                </div>
                <p
                  style={{
                    fontWeight: 700,
                    fontSize: '1rem',
                    color: tx.type === 'income' ? 'var(--income)' : 'var(--expense)'
                  }}
                >
                  {tx.type === 'income' ? '+' : '-'}
                  {Math.abs(parseFloat(tx.amount || 0)).toFixed(2)} €
                </p>
              </div>
            ))
          ) : (
            <p className="empty-state">Няма транзакции</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
