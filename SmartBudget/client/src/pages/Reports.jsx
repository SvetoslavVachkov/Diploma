import React, { useState, useEffect } from 'react';
import { Line, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import api from '../services/api';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

const Reports = () => {
  const [spendingReport, setSpendingReport] = useState(null);
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    fetchReports();
  }, [dateFrom, dateTo]);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const [spendingRes, monthlyRes] = await Promise.all([
        api.get('/financial/reports/spending', { params }).catch(() => ({ data: { data: null } })),
        api.get('/financial/reports/monthly', {
          params: {
            year: new Date().getFullYear(),
            month: new Date().getMonth() + 1
          }
        }).catch(() => ({ data: { data: null } }))
      ]);
      
      setSpendingReport(spendingRes.data?.data || null);
      setMonthlyReport(monthlyRes.data?.data || null);
    } catch (error) {
      setSpendingReport(null);
      setMonthlyReport(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={styles.loading}>Зареждане...</div>;
  }

  const categoryData = (spendingReport?.top_categories || spendingReport?.report?.top_categories || []).slice(0, 5);
  const doughnutData = {
    labels: categoryData.map((cat) => cat.category_name),
    datasets: [
      {
        data: categoryData.map((cat) => cat.total),
        backgroundColor: [
          '#667eea',
          '#764ba2',
          '#f093fb',
          '#4facfe',
          '#00f2fe'
        ],
        borderWidth: 0
      }
    ]
  };

  const monthlyData = monthlyReport && monthlyReport.totals
    ? {
        labels: ['Приходи', 'Разходи'],
        datasets: [
          {
            label: 'Сума',
            data: [
              parseFloat(monthlyReport.totals.income || 0),
              parseFloat(monthlyReport.totals.expense || 0)
            ],
            backgroundColor: ['#10b981', '#ef4444'],
            borderWidth: 0
          }
        ]
      }
    : null;

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Отчети</h1>
        <div style={styles.dateFilters}>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            placeholder="От дата"
            style={styles.dateInput}
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            placeholder="До дата"
            style={styles.dateInput}
          />
        </div>
      </div>

      {spendingReport && spendingReport.summary && (
        <div style={styles.summarySection}>
          <div style={styles.summaryCard}>
            <h3 style={styles.summaryTitle}>Общо разходи</h3>
            <p style={styles.summaryAmount}>
              {(spendingReport.summary.total_spent || 0).toFixed(2)} лв
            </p>
          </div>
          <div style={styles.summaryCard}>
            <h3 style={styles.summaryTitle}>Брой транзакции</h3>
            <p style={styles.summaryAmount}>{spendingReport.summary.transaction_count || 0}</p>
          </div>
          <div style={styles.summaryCard}>
            <h3 style={styles.summaryTitle}>Средна транзакция</h3>
            <p style={styles.summaryAmount}>
              {(spendingReport.summary.average_transaction || 0).toFixed(2)} лв
            </p>
          </div>
        </div>
      )}

      <div style={styles.chartsGrid}>
        {categoryData.length > 0 && (
          <div style={styles.chartCard}>
            <h2 style={styles.chartTitle}>Разпределение по категории</h2>
            <div style={styles.chartContainer}>
              <Doughnut data={doughnutData} options={chartOptions} />
            </div>
            <div style={styles.categoryList}>
              {categoryData.map((cat, idx) => (
                <div key={idx} style={styles.categoryItem}>
                  <div style={styles.categoryInfo}>
                    <div
                      style={{
                        ...styles.categoryColor,
                        background: doughnutData.datasets[0].backgroundColor[idx]
                      }}
                    />
                    <span style={styles.categoryName}>{cat.category_name}</span>
                  </div>
                  <div style={styles.categoryAmount}>
                    <span style={styles.categoryTotal}>{(cat.total || 0).toFixed(2)} лв</span>
                    <span style={styles.categoryPercent}>({(cat.percentage || 0).toFixed(1)}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {monthlyData && (
          <div style={styles.chartCard}>
            <h2 style={styles.chartTitle}>Месечен преглед</h2>
            <div style={styles.chartContainer}>
              <Doughnut data={monthlyData} options={chartOptions} />
            </div>
            <div style={styles.monthlyStats}>
              <div style={styles.statItem}>
                <span style={styles.statLabel}>Приходи:</span>
                <span style={styles.statValueIncome}>
                  {monthlyReport.totals?.income?.toFixed(2) || '0.00'} лв
                </span>
              </div>
              <div style={styles.statItem}>
                <span style={styles.statLabel}>Разходи:</span>
                <span style={styles.statValueExpense}>
                  {monthlyReport.totals?.expense?.toFixed(2) || '0.00'} лв
                </span>
              </div>
              <div style={styles.statItem}>
                <span style={styles.statLabel}>Баланс:</span>
                <span
                  style={{
                    ...styles.statValue,
                    color:
                      (monthlyReport.totals?.balance || 0) >= 0
                        ? '#10b981'
                        : '#ef4444'
                  }}
                >
                  {(monthlyReport.totals?.balance || 0).toFixed(2)} лв
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {spendingReport?.insights && (
        <div style={styles.insightsSection}>
          <h2 style={styles.insightsTitle}>Анализ</h2>
          <div style={styles.insightsGrid}>
            {spendingReport.insights.highest_spending_day && (
              <div style={styles.insightCard}>
                <h3 style={styles.insightLabel}>Най-висок разход (ден)</h3>
                <p style={styles.insightValue}>
                  {new Date(
                    spendingReport.insights.highest_spending_day.date
                  ).toLocaleDateString('bg-BG')}
                </p>
                <p style={styles.insightAmount}>
                  {(spendingReport.insights.highest_spending_day.amount || 0).toFixed(2)} лв
                </p>
              </div>
            )}
            {spendingReport.insights.largest_transaction && (
              <div style={styles.insightCard}>
                <h3 style={styles.insightLabel}>Най-голяма транзакция</h3>
                <p style={styles.insightValue}>
                  {spendingReport.insights.largest_transaction.description || 'Няма описание'}
                </p>
                <p style={styles.insightAmount}>
                  {(spendingReport.insights.largest_transaction.amount || 0).toFixed(2)} лв
                </p>
              </div>
            )}
            {spendingReport.insights.most_frequent_category && (
              <div style={styles.insightCard}>
                <h3 style={styles.insightLabel}>Най-честа категория</h3>
                <p style={styles.insightValue}>
                  {spendingReport.insights.most_frequent_category.category_name || 'Други'}
                </p>
                <p style={styles.insightAmount}>
                  {spendingReport.insights.most_frequent_category.count || 0} транзакции
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false
    }
  }
};

const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '30px',
    flexWrap: 'wrap',
    gap: '20px'
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: 'white'
  },
  dateFilters: {
    display: 'flex',
    gap: '12px'
  },
  dateInput: {
    padding: '10px',
    border: '2px solid white',
    borderRadius: '8px',
    background: 'rgba(255,255,255,0.9)',
    fontSize: '14px',
    outline: 'none'
  },
  summarySection: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginBottom: '30px'
  },
  summaryCard: {
    background: 'white',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
  },
  summaryTitle: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '8px'
  },
  summaryAmount: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#333'
  },
  chartsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
    gap: '30px',
    marginBottom: '30px'
  },
  chartCard: {
    background: 'white',
    borderRadius: '16px',
    padding: '30px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
  },
  chartTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '20px'
  },
  chartContainer: {
    height: '300px',
    marginBottom: '20px'
  },
  categoryList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  categoryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    background: '#f9fafb',
    borderRadius: '8px'
  },
  categoryInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  categoryColor: {
    width: '16px',
    height: '16px',
    borderRadius: '4px'
  },
  categoryName: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#333'
  },
  categoryAmount: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end'
  },
  categoryTotal: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#333'
  },
  categoryPercent: {
    fontSize: '12px',
    color: '#666'
  },
  monthlyStats: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  statItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px',
    background: '#f9fafb',
    borderRadius: '8px'
  },
  statLabel: {
    fontSize: '16px',
    color: '#666'
  },
  statValue: {
    fontSize: '16px',
    fontWeight: 'bold'
  },
  statValueIncome: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#10b981'
  },
  statValueExpense: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#ef4444'
  },
  insightsSection: {
    background: 'white',
    borderRadius: '16px',
    padding: '30px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
  },
  insightsTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '20px'
  },
  insightsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px'
  },
  insightCard: {
    padding: '20px',
    background: '#f9fafb',
    borderRadius: '12px'
  },
  insightLabel: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '8px'
  },
  insightValue: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#333',
    marginBottom: '4px'
  },
  insightAmount: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#667eea'
  },
  loading: {
    textAlign: 'center',
    color: 'white',
    fontSize: '18px',
    padding: '40px'
  }
};

export default Reports;

