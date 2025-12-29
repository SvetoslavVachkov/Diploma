import React, { useState, useEffect } from 'react';
import api from '../services/api';

const Dashboard = () => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    try {
      const [transactionsRes, summaryRes] = await Promise.all([
        api.get('/financial/transactions?limit=5'),
        api.get('/financial/transactions/summary')
      ]);
      setSummary({
        recent: transactionsRes.data.data.transactions,
        totals: summaryRes.data.data
      });
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={styles.loading}>Зареждане...</div>;
  }

  return (
    <div>
      <h1 style={styles.title}>Начало</h1>
      <div style={styles.cards}>
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Приходи</h3>
          <p style={styles.cardAmount}>
            {summary?.totals.total_income?.toFixed(2) || '0.00'} лв
          </p>
        </div>
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Разходи</h3>
          <p style={styles.cardAmount}>
            {summary?.totals.total_expense?.toFixed(2) || '0.00'} лв
          </p>
        </div>
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Баланс</h3>
          <p style={styles.cardAmount}>
            {summary?.totals.balance?.toFixed(2) || '0.00'} лв
          </p>
        </div>
      </div>
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Последни транзакции</h2>
        <div style={styles.transactions}>
          {summary?.recent?.length > 0 ? (
            summary.recent.map((tx) => (
              <div key={tx.id} style={styles.transaction}>
                <div>
                  <p style={styles.transactionDesc}>{tx.description}</p>
                  <p style={styles.transactionDate}>
                    {new Date(tx.transaction_date).toLocaleDateString('bg-BG')}
                  </p>
                </div>
                <p
                  style={{
                    ...styles.transactionAmount,
                    color: tx.type === 'income' ? '#10b981' : '#ef4444'
                  }}
                >
                  {tx.type === 'income' ? '+' : '-'}
                  {parseFloat(tx.amount).toFixed(2)} лв
                </p>
              </div>
            ))
          ) : (
            <p style={styles.empty}>Няма транзакции</p>
          )}
        </div>
      </div>
    </div>
  );
};

const styles = {
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: 'white',
    marginBottom: '30px'
  },
  cards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
    marginBottom: '40px'
  },
  card: {
    background: 'white',
    borderRadius: '16px',
    padding: '30px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
  },
  cardTitle: {
    fontSize: '16px',
    color: '#666',
    marginBottom: '10px'
  },
  cardAmount: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#333'
  },
  section: {
    background: 'white',
    borderRadius: '16px',
    padding: '30px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
  },
  sectionTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '20px'
  },
  transactions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  transaction: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px',
    background: '#f9fafb',
    borderRadius: '8px'
  },
  transactionDesc: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#333',
    marginBottom: '4px'
  },
  transactionDate: {
    fontSize: '14px',
    color: '#666'
  },
  transactionAmount: {
    fontSize: '18px',
    fontWeight: 'bold'
  },
  empty: {
    textAlign: 'center',
    color: '#666',
    padding: '40px'
  },
  loading: {
    textAlign: 'center',
    color: 'white',
    fontSize: '18px',
    padding: '40px'
  }
};

export default Dashboard;

