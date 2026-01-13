import React, { useState, useEffect, useCallback } from 'react';
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
  const [productAnalysis, setProductAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateRange, setDateRange] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  const fetchReports = useCallback(async (fromDate = dateFrom, toDate = dateTo, query = debouncedSearchQuery) => {
    try {
      setLoading(true);
      const params = {};
      if (fromDate && fromDate.trim().length > 0) params.date_from = fromDate.trim();
      if (toDate && toDate.trim().length > 0) params.date_to = toDate.trim();
      if (query && query.trim().length > 0) params.search = query.trim();
      params.skip_ai = 'true';

      const shouldFetchMonthly = dateRange === 'month' || (dateRange === 'custom' && fromDate && toDate && fromDate.substring(0, 7) === toDate.substring(0, 7));

      const promises = [
        api.get('/financial/reports/spending', { params }).catch((err) => {
          return { data: { status: 'error', data: null } };
        }),
        api.get('/financial/reports/products', { params }).catch((err) => {
          return { data: { status: 'error', data: null } };
        })
      ];

      if (shouldFetchMonthly) {
        promises.push(
        api.get('/financial/reports/monthly', {
          params: {
              year: fromDate && fromDate.length > 0 ? new Date(fromDate).getFullYear() : new Date().getFullYear(),
              month: fromDate && fromDate.length > 0 ? new Date(fromDate).getMonth() + 1 : new Date().getMonth() + 1
          }
          }).catch((err) => {
            return { data: { status: 'error', data: null } };
          })
        );
      } else {
        promises.push(Promise.resolve({ data: { status: 'success', data: null } }));
      }

      const [spendingRes, productsRes, monthlyRes] = await Promise.all(promises);
      
      if (spendingRes.data?.status === 'success' && spendingRes.data.data) {
        const reportData = spendingRes.data.data;
        if (!reportData.summary) {
          reportData.summary = { 
            total_income: 0, 
            total_spent: 0, 
            balance: 0, 
            transaction_count: 0, 
            average_transaction: 0 
          };
        } else {
          if (reportData.summary.total_income === undefined) reportData.summary.total_income = 0;
          if (reportData.summary.total_spent === undefined) reportData.summary.total_spent = 0;
          if (reportData.summary.balance === undefined) reportData.summary.balance = 0;
          if (reportData.summary.transaction_count === undefined) reportData.summary.transaction_count = 0;
          if (reportData.summary.average_transaction === undefined) reportData.summary.average_transaction = 0;
        }
        if (!reportData.top_categories) {
          reportData.top_categories = [];
        }
        if (!reportData.insights) {
          reportData.insights = {
            highest_spending_day: null,
            largest_transaction: null,
            most_frequent_category: null
          };
        }
        setSpendingReport(reportData);
      } else {
        setSpendingReport({
          summary: { 
            total_income: 0, 
            total_spent: 0, 
            balance: 0, 
            transaction_count: 0, 
            average_transaction: 0 
          },
          top_categories: [],
          insights: {
            highest_spending_day: null,
            largest_transaction: null,
            most_frequent_category: null
          }
        });
      }

      if (shouldFetchMonthly && monthlyRes.data?.status === 'success' && monthlyRes.data.data) {
        const monthlyData = monthlyRes.data.data;
        if (!monthlyData.totals) {
          monthlyData.totals = { income: 0, expense: 0, balance: 0 };
        }
        setMonthlyReport(monthlyData);
      } else {
        setMonthlyReport(null);
      }

      if (productsRes.data?.status === 'success') {
        setProductAnalysis(productsRes.data.data || { top_products: [], ai_recommendations: [] });
      } else {
        setProductAnalysis(null);
      }

      if (spendingRes.data?.status === 'success' && spendingRes.data.data && spendingRes.data.data.summary && spendingRes.data.data.summary.transaction_count > 0) {
        fetchAiAnalysis(fromDate, toDate, query);
      } else {
        setAiAnalysisLoading(false);
        setAiAnalysis(null);
      }
    } catch (error) {
      setSpendingReport(null);
      setMonthlyReport(null);
      setProductAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, debouncedSearchQuery, dateRange]);

  const fetchAiAnalysis = useCallback(async (fromDate = dateFrom, toDate = dateTo, query = debouncedSearchQuery) => {
    try {
      setAiAnalysisLoading(true);
      setAiAnalysis(null);
      const params = {};
      if (fromDate && fromDate.trim().length > 0) params.date_from = fromDate.trim();
      if (toDate && toDate.trim().length > 0) params.date_to = toDate.trim();
      if (query && query.trim().length > 0) params.search = query.trim();

      const response = await api.get('/financial/reports/spending/analysis', { params });
      if (response.data?.status === 'success' && response.data.data?.ai_analysis) {
        setAiAnalysis(response.data.data.ai_analysis);
      }
    } catch (error) {
      setAiAnalysis(null);
    } finally {
      setAiAnalysisLoading(false);
    }
  }, [dateFrom, dateTo, debouncedSearchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (dateRange === 'custom') {
      return;
    }

    const today = new Date();
    today.setHours(23, 59, 59, 999);
    let from = '';
    let to = '';
    
    switch(dateRange) {
      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(today.getDate() - 7);
        weekAgo.setHours(0, 0, 0, 0);
        from = `${weekAgo.getFullYear()}-${String(weekAgo.getMonth() + 1).padStart(2, '0')}-${String(weekAgo.getDate()).padStart(2, '0')}`;
        to = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        break;
      case 'month':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        from = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}-${String(monthStart.getDate()).padStart(2, '0')}`;
        to = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`;
        break;
      case 'quarter':
        const quarter = Math.floor(today.getMonth() / 3);
        const quarterStart = new Date(today.getFullYear(), quarter * 3, 1);
        const quarterEnd = new Date(today.getFullYear(), (quarter + 1) * 3, 0);
        from = `${quarterStart.getFullYear()}-${String(quarterStart.getMonth() + 1).padStart(2, '0')}-${String(quarterStart.getDate()).padStart(2, '0')}`;
        to = `${quarterEnd.getFullYear()}-${String(quarterEnd.getMonth() + 1).padStart(2, '0')}-${String(quarterEnd.getDate()).padStart(2, '0')}`;
        break;
      case 'year':
        const yearStart = new Date(today.getFullYear(), 0, 1);
        yearStart.setHours(0, 0, 0, 0);
        const yearEnd = new Date(today.getFullYear(), 11, 31);
        yearEnd.setHours(23, 59, 59, 999);
        from = `${yearStart.getFullYear()}-${String(yearStart.getMonth() + 1).padStart(2, '0')}-${String(yearStart.getDate()).padStart(2, '0')}`;
        to = `${yearEnd.getFullYear()}-${String(yearEnd.getMonth() + 1).padStart(2, '0')}-${String(yearEnd.getDate()).padStart(2, '0')}`;
        break;
      case 'all':
        from = '';
        to = '';
        break;
      default:
        const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const defaultEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        from = `${defaultStart.getFullYear()}-${String(defaultStart.getMonth() + 1).padStart(2, '0')}-${String(defaultStart.getDate()).padStart(2, '0')}`;
        to = `${defaultEnd.getFullYear()}-${String(defaultEnd.getMonth() + 1).padStart(2, '0')}-${String(defaultEnd.getDate()).padStart(2, '0')}`;
    }
    
    setDateFrom(from);
    setDateTo(to);
  }, [dateRange]);

  useEffect(() => {
    if (dateRange !== 'custom' || (dateFrom && dateTo)) {
      fetchReports(dateFrom, dateTo, debouncedSearchQuery);
    }
  }, [dateFrom, dateTo, debouncedSearchQuery, dateRange, fetchReports]);

  if (loading) {
    return <div style={styles.loading}>Зареждане...</div>;
  }

  const categoryData = spendingReport && spendingReport.top_categories && Array.isArray(spendingReport.top_categories)
    ? spendingReport.top_categories.slice(0, 5).filter(cat => cat && cat.category_name && cat.total)
    : [];

  const doughnutData = categoryData.length > 0 ? {
    labels: categoryData.map((cat) => cat.category_name),
    datasets: [
      {
        data: categoryData.map((cat) => Math.abs(parseFloat(cat.total) || 0)),
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
  } : null;

  const monthlyData = monthlyReport && monthlyReport.totals && (monthlyReport.totals.income > 0 || monthlyReport.totals.expense > 0)
    ? {
        labels: ['Приходи', 'Разходи'],
        datasets: [
          {
            label: 'Сума',
            data: [
              Math.abs(parseFloat(monthlyReport.totals.income || 0)),
              Math.abs(parseFloat(monthlyReport.totals.expense || 0))
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
        <div style={styles.filtersContainer}>
          <div style={styles.dateRangeButtons}>
            <button
              onClick={() => setDateRange('week')}
              style={{...styles.rangeButton, ...(dateRange === 'week' ? styles.rangeButtonActive : {})}}
            >
              Последна седмица
            </button>
            <button
              onClick={() => setDateRange('month')}
              style={{...styles.rangeButton, ...(dateRange === 'month' ? styles.rangeButtonActive : {})}}
            >
              Този месец
            </button>
            <button
              onClick={() => setDateRange('quarter')}
              style={{...styles.rangeButton, ...(dateRange === 'quarter' ? styles.rangeButtonActive : {})}}
            >
              Това тримесечие
            </button>
            <button
              onClick={() => setDateRange('year')}
              style={{...styles.rangeButton, ...(dateRange === 'year' ? styles.rangeButtonActive : {})}}
            >
              Тази година
            </button>
            <button
              onClick={() => setDateRange('all')}
              style={{...styles.rangeButton, ...(dateRange === 'all' ? styles.rangeButtonActive : {})}}
            >
              Всички
            </button>
          </div>
        <div style={styles.dateFilters}>
          <input
              type="text"
              value={dateFrom || ''}
              onChange={(e) => {
                setDateFrom(e.target.value);
                if (e.target.value) {
                  setDateRange('custom');
                }
              }}
              placeholder="От дата (YYYY-MM-DD или DD.MM.YYYY)"
            style={styles.dateInput}
              pattern="\d{4}-\d{2}-\d{2}|\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4}"
          />
          <input
              type="text"
              value={dateTo || ''}
              onChange={(e) => {
                setDateTo(e.target.value);
                if (e.target.value) {
                  setDateRange('custom');
                }
              }}
              placeholder="До дата (YYYY-MM-DD или DD.MM.YYYY)"
            style={styles.dateInput}
              pattern="\d{4}-\d{2}-\d{2}|\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4}"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Търсене по категория или описание..."
              style={styles.searchInput}
          />
          </div>
        </div>
      </div>

      {spendingReport?.summary && (
        <div style={styles.summarySection}>
          <div style={styles.summaryCard}>
            <h3 style={styles.summaryTitle}>Общо приходи</h3>
            <p style={{...styles.summaryAmount, color: '#10b981'}}>
              +{(spendingReport.summary.total_income || 0).toFixed(2)} €
            </p>
          </div>
          <div style={styles.summaryCard}>
            <h3 style={styles.summaryTitle}>Общо разходи</h3>
            <p style={{...styles.summaryAmount, color: '#ef4444'}}>
              -{(spendingReport.summary.total_spent || 0).toFixed(2)} €
            </p>
          </div>
          <div style={styles.summaryCard}>
            <h3 style={styles.summaryTitle}>Баланс</h3>
            <p style={{
              ...styles.summaryAmount,
              color: (spendingReport.summary.balance || 0) >= 0 ? '#10b981' : '#ef4444'
            }}>
              {spendingReport.summary.balance >= 0 ? '+' : ''}{(spendingReport.summary.balance || 0).toFixed(2)} €
            </p>
          </div>
          <div style={styles.summaryCard}>
            <h3 style={styles.summaryTitle}>Брой транзакции</h3>
            <p style={styles.summaryAmount}>{spendingReport.summary.transaction_count || 0}</p>
          </div>
          <div style={styles.summaryCard}>
            <h3 style={styles.summaryTitle}>Средна транзакция</h3>
            <p style={styles.summaryAmount}>
              {(spendingReport.summary.average_transaction || 0).toFixed(2)} €
            </p>
          </div>
        </div>
      )}

      <div style={styles.chartsGrid}>
        {doughnutData && categoryData.length > 0 && (
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
                        background: doughnutData.datasets[0].backgroundColor[idx % doughnutData.datasets[0].backgroundColor.length]
                      }}
                    />
                    <span style={styles.categoryName}>{cat.category_name || 'Без име'}</span>
                  </div>
                  <div style={styles.categoryAmount}>
                    <span style={styles.categoryTotal}>{Math.abs(parseFloat(cat.total || 0)).toFixed(2)} €</span>
                    <span style={styles.categoryPercent}>({Math.abs(parseFloat(cat.percentage || 0)).toFixed(1)}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {monthlyData && monthlyReport && monthlyReport.totals && dateRange === 'month' && (
          <div style={styles.chartCard}>
            <h2 style={styles.chartTitle}>Месечен преглед</h2>
            <div style={styles.chartContainer}>
              <Doughnut data={monthlyData} options={chartOptions} />
            </div>
            <div style={styles.monthlyStats}>
              <div style={styles.statItem}>
                <span style={styles.statLabel}>Приходи:</span>
                <span style={styles.statValueIncome}>
                  {Math.abs(parseFloat(monthlyReport.totals.income || 0)).toFixed(2)} €
                </span>
              </div>
              <div style={styles.statItem}>
                <span style={styles.statLabel}>Разходи:</span>
                <span style={styles.statValueExpense}>
                  {Math.abs(parseFloat(monthlyReport.totals.expense || 0)).toFixed(2)} €
                </span>
              </div>
              <div style={styles.statItem}>
                <span style={styles.statLabel}>Баланс:</span>
                <span
                  style={{
                    ...styles.statValue,
                    color:
                      parseFloat(monthlyReport.totals.balance || 0) >= 0
                        ? '#10b981'
                        : '#ef4444'
                  }}
                >
                  {parseFloat(monthlyReport.totals.balance || 0).toFixed(2)} €
                </span>
              </div>
            </div>
          </div>
        )}

        {!doughnutData && !monthlyData && (
          <div style={styles.emptySection}>
            <p style={styles.emptyText}>
              {dateFrom || dateTo 
                ? `Няма данни за периода ${dateFrom || 'начало'} - ${dateTo || 'край'}`
                : 'Няма данни за показване. Моля импортирайте транзакции или създайте нови.'}
            </p>
          </div>
        )}
      </div>

      {productAnalysis && productAnalysis.top_products && productAnalysis.top_products.length > 0 && (
        <div style={styles.insightsSection}>
          <h2 style={styles.insightsTitle}>Най-купувани продукти</h2>
          <div style={styles.productsGrid}>
            {productAnalysis.top_products.slice(0, 10).map((product, idx) => (
              <div key={idx} style={styles.productCard}>
                <h3 style={styles.productName}>{product.product_name}</h3>
                <p style={styles.productInfo}>Купени: {product.purchase_count} пъти</p>
                <p style={styles.productAmount}>Общо: {product.total_spent.toFixed(2)} €</p>
                {product.category && (
                  <p style={styles.productCategory}>Категория: {product.category}</p>
                )}
              </div>
            ))}
          </div>
          {productAnalysis.ai_recommendations && (
            <div style={styles.aiRecommendations}>
              <h3 style={styles.recommendationsTitle}>AI Препоръки</h3>
              {productAnalysis.ai_recommendations.map((rec, idx) => (
                <div key={idx} style={styles.recommendationItem}>
                  <p style={styles.recommendationText}>{rec}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {spendingReport?.summary && spendingReport.summary.transaction_count > 0 && (aiAnalysisLoading || aiAnalysis) && (
        <div style={styles.insightsSection}>
          <h2 style={styles.insightsTitle}>AI Финансов Анализ</h2>
          {aiAnalysisLoading ? (
            <div style={styles.aiAnalysisCard}>
              <div style={styles.aiAnalysisContent}>
                <p style={styles.aiAnalysisText}>Моля изчакайте за детайлен анализ...</p>
              </div>
            </div>
          ) : aiAnalysis ? (
            <div style={styles.aiAnalysisCard}>
              <div style={styles.aiAnalysisContent}>
                {aiAnalysis.split('\n').map((line, idx) => (
                  <p key={idx} style={styles.aiAnalysisText}>
                    {line.trim() || '\u00A0'}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {spendingReport?.summary && spendingReport.summary.transaction_count > 0 && spendingReport?.insights && (
        <div style={styles.insightsSection}>
          <h2 style={styles.insightsTitle}>Ключови Показатели</h2>
          <div style={styles.insightsGrid}>
            {spendingReport.insights.highest_spending_day && spendingReport.insights.highest_spending_day.date && (
              <div style={styles.insightCard}>
                <h3 style={styles.insightLabel}>Най-висок разход (ден)</h3>
                <p style={styles.insightValue}>
                  {(() => {
                    try {
                      const dateStr = String(spendingReport.insights.highest_spending_day.date);
                      const date = new Date(dateStr);
                      if (!isNaN(date.getTime())) {
                        return date.toLocaleDateString('bg-BG');
                      }
                      return dateStr;
                    } catch {
                      return String(spendingReport.insights.highest_spending_day.date || '');
                    }
                  })()}
                </p>
                <p style={styles.insightAmount}>
                  {(parseFloat(spendingReport.insights.highest_spending_day.amount) || 0).toFixed(2)} €
                </p>
              </div>
            )}
            {spendingReport.insights.largest_transaction && spendingReport.insights.largest_transaction.description && (
              <div style={styles.insightCard}>
                <h3 style={styles.insightLabel}>Най-голяма транзакция</h3>
                <p style={styles.insightValue}>
                  {String(spendingReport.insights.largest_transaction.description || 'Няма описание')}
                </p>
                <p style={styles.insightAmount}>
                  {(parseFloat(spendingReport.insights.largest_transaction.amount) || 0).toFixed(2)} €
                </p>
              </div>
            )}
            {spendingReport.insights.most_frequent_category && spendingReport.insights.most_frequent_category.category_name && (
              <div style={styles.insightCard}>
                <h3 style={styles.insightLabel}>Най-честа категория</h3>
                <p style={styles.insightValue}>
                  {String(spendingReport.insights.most_frequent_category.category_name || 'Други')}
                </p>
                <p style={styles.insightAmount}>
                  {parseInt(spendingReport.insights.most_frequent_category.count) || 0} транзакции
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {productAnalysis && productAnalysis.top_products && productAnalysis.top_products.length > 0 && (
        <div style={styles.insightsSection}>
          <h2 style={styles.insightsTitle}>Най-купувани продукти</h2>
          <div style={styles.productsGrid}>
            {productAnalysis.top_products.slice(0, 20).map((product, idx) => (
              <div key={idx} style={styles.productCard}>
                <h3 style={styles.productName}>{product.product_name || 'Неизвестен продукт'}</h3>
                <p style={styles.productInfo}>Купени: {product.purchase_count || 0} пъти</p>
                <p style={styles.productAmount}>Общо: {(product.total_spent || 0).toFixed(2)} €</p>
                {product.category && (
                  <p style={styles.productCategory}>Категория: {product.category}</p>
                )}
              </div>
            ))}
          </div>
          {productAnalysis.ai_recommendations && productAnalysis.ai_recommendations.length > 0 && (
            <div style={styles.aiRecommendations}>
              <h3 style={styles.recommendationsTitle}>AI Препоръки</h3>
              {productAnalysis.ai_recommendations.map((rec, idx) => (
                <div key={idx} style={styles.recommendationItem}>
                  <p style={styles.recommendationText}>{rec}</p>
                </div>
              ))}
            </div>
          )}
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
  filtersContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    width: '100%'
  },
  dateRangeButtons: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap'
  },
  rangeButton: {
    padding: '8px 16px',
    border: '2px solid white',
    borderRadius: '8px',
    background: 'rgba(255,255,255,0.1)',
    color: 'white',
    fontSize: '14px',
    cursor: 'pointer',
    outline: 'none'
  },
  rangeButtonActive: {
    background: 'rgba(255,255,255,0.9)',
    color: '#333',
    fontWeight: '600'
  },
  dateFilters: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap'
  },
  dateInput: {
    padding: '10px',
    border: '2px solid white',
    borderRadius: '8px',
    background: 'rgba(255,255,255,0.9)',
    fontSize: '14px',
    outline: 'none'
  },
  searchInput: {
    padding: '10px',
    border: '2px solid white',
    borderRadius: '8px',
    background: 'rgba(255,255,255,0.9)',
    fontSize: '14px',
    outline: 'none',
    flex: 1,
    minWidth: '200px'
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
  productsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '30px'
  },
  productCard: {
    padding: '16px',
    background: '#f9fafb',
    borderRadius: '12px',
    border: '1px solid #e5e7eb'
  },
  productName: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '8px'
  },
  productInfo: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '4px'
  },
  productAmount: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#667eea',
    marginBottom: '4px'
  },
  productCategory: {
    fontSize: '12px',
    color: '#999',
    marginTop: '4px'
  },
  aiRecommendations: {
    marginTop: '30px',
    padding: '20px',
    background: '#f0f9ff',
    borderRadius: '12px',
    border: '1px solid #bae6fd'
  },
  recommendationsTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: '16px'
  },
  recommendationItem: {
    padding: '12px',
    marginBottom: '8px',
    background: 'white',
    borderRadius: '8px',
    borderLeft: '4px solid #3b82f6'
  },
  recommendationText: {
    fontSize: '14px',
    color: '#333',
    lineHeight: '1.6',
    margin: 0
  },
  aiAnalysisCard: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    borderRadius: '16px',
    padding: '30px',
    marginBottom: '30px',
    boxShadow: '0 8px 24px rgba(102, 126, 234, 0.3)'
  },
  aiAnalysisContent: {
    background: 'white',
    borderRadius: '12px',
    padding: '24px',
    maxHeight: '600px',
    overflowY: 'auto'
  },
  aiAnalysisText: {
    fontSize: '15px',
    lineHeight: '1.8',
    color: '#2c3e50',
    margin: '8px 0',
    textAlign: 'left'
  },
  loading: {
    textAlign: 'center',
    color: 'white',
    fontSize: '18px',
    padding: '40px'
  },
  emptySection: {
    gridColumn: '1 / -1',
    textAlign: 'center',
    padding: '60px 20px',
    background: 'white',
    borderRadius: '16px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
  },
  emptyText: {
    fontSize: '18px',
    color: '#666',
    margin: 0
  }
};

export default Reports;

