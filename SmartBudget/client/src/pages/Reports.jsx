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

      const spendingPromise = api.get('/financial/reports/spending', { params }).catch((err) => {
        return { data: { status: 'error', data: null } };
      });

      const productsPromise = api.get('/financial/reports/products', { params }).catch((err) => {
        return { data: { status: 'error', data: null } };
      });

      const monthlyPromise = shouldFetchMonthly
        ? api.get('/financial/reports/monthly', {
          params: {
              year: fromDate && fromDate.length > 0 ? new Date(fromDate).getFullYear() : new Date().getFullYear(),
              month: fromDate && fromDate.length > 0 ? new Date(fromDate).getMonth() + 1 : new Date().getMonth() + 1
          }
          }).catch((err) => {
            return { data: { status: 'error', data: null } };
          })
        : Promise.resolve({ data: { status: 'success', data: null } });

      const spendingRes = await spendingPromise;
      
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
        setLoading(false);
        
        if (reportData.summary && reportData.summary.transaction_count > 0) {
          setTimeout(() => {
            fetchAiAnalysis(fromDate, toDate, query);
          }, 100);
        } else {
          setAiAnalysisLoading(false);
          setAiAnalysis(null);
        }
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
        setLoading(false);
        setAiAnalysisLoading(false);
        setAiAnalysis(null);
      }

      productsPromise.then((productsRes) => {
        if (productsRes.data?.status === 'success') {
          setProductAnalysis(productsRes.data.data || { top_products: [], ai_recommendations: [] });
        } else {
          setProductAnalysis(null);
        }
      });

      monthlyPromise.then((monthlyRes) => {
        if (shouldFetchMonthly && monthlyRes.data?.status === 'success' && monthlyRes.data.data) {
          const monthlyData = monthlyRes.data.data;
          if (!monthlyData.totals) {
            monthlyData.totals = { income: 0, expense: 0, balance: 0 };
          }
          setMonthlyReport(monthlyData);
        } else {
          setMonthlyReport(null);
        }
      });
    } catch (error) {
      setSpendingReport(null);
      setMonthlyReport(null);
      setProductAnalysis(null);
      setLoading(false);
      setAiAnalysisLoading(false);
      setAiAnalysis(null);
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
    return <div className="loading-screen">Зареждане…</div>;
  }

  const categoryData = spendingReport && spendingReport.top_categories && Array.isArray(spendingReport.top_categories)
    ? spendingReport.top_categories.slice(0, 5).filter(cat => cat && cat.category_name && cat.total)
    : [];

  const doughnutData = categoryData.length > 0 ? {
    labels: categoryData.map((cat) => cat.category_name),
    datasets: [
      {
        data: categoryData.map((cat) => Math.abs(parseFloat(cat.total) || 0)),
        backgroundColor: ['#0f766e', '#0d9488', '#14b8a6', '#5eead4', '#99f6e4'],
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
    <div className="page">
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 className="page-title" style={{ marginBottom: '1rem' }}>Отчети</h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {['week', 'month', 'quarter', 'year', 'all'].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDateRange(r)}
                className={dateRange === r ? 'btn btn-primary' : 'btn btn-ghost'}
                style={{ padding: '0.5rem 0.75rem', fontSize: '0.9rem' }}
              >
                {r === 'week' && 'Последна седмица'}
                {r === 'month' && 'Този месец'}
                {r === 'quarter' && 'Това тримесечие'}
                {r === 'year' && 'Тази година'}
                {r === 'all' && 'Всички'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              className="input"
              value={dateFrom || ''}
              onChange={(e) => {
                setDateFrom(e.target.value);
                if (e.target.value) setDateRange('custom');
              }}
              placeholder="От дата (YYYY-MM-DD или DD.MM.YYYY)"
              style={{ maxWidth: 220 }}
            />
            <input
              type="text"
              className="input"
              value={dateTo || ''}
              onChange={(e) => {
                setDateTo(e.target.value);
                if (e.target.value) setDateRange('custom');
              }}
              placeholder="До дата (YYYY-MM-DD или DD.MM.YYYY)"
              style={{ maxWidth: 220 }}
            />
            <input
              type="text"
              className="input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Търсене по категория или описание…"
              style={{ flex: 1, minWidth: 200 }}
            />
          </div>
        </div>
      </div>

      {spendingReport?.summary && (
        <div className="cards-grid" style={{ marginBottom: '1.5rem' }}>
          <div className="card">
            <h3 className="card-title">Общо приходи</h3>
            <p className="card-value text-income">{(spendingReport.summary.total_income || 0).toFixed(2)} €</p>
          </div>
          <div className="card">
            <h3 className="card-title">Общо разходи</h3>
            <p className="card-value text-expense">{(spendingReport.summary.total_spent || 0).toFixed(2)} €</p>
          </div>
          <div className="card">
            <h3 className="card-title">Баланс</h3>
            <p className="card-value" style={{ color: (spendingReport.summary.balance || 0) >= 0 ? 'var(--income)' : 'var(--expense)' }}>
              {spendingReport.summary.balance >= 0 ? '+' : ''}{(spendingReport.summary.balance || 0).toFixed(2)} €
            </p>
          </div>
          <div className="card">
            <h3 className="card-title">Брой транзакции</h3>
            <p className="card-value">{spendingReport.summary.transaction_count || 0}</p>
          </div>
          <div className="card">
            <h3 className="card-title">Средна транзакция</h3>
            <p className="card-value">{(spendingReport.summary.average_transaction || 0).toFixed(2)} €</p>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {doughnutData && categoryData.length > 0 && (
          <div className="chart-card">
            <h2 className="chart-title">Разпределение по категории</h2>
            <div className="chart-container">
              <Doughnut data={doughnutData} options={chartOptions} />
            </div>
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {categoryData.map((cat, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: doughnutData.datasets[0].backgroundColor[idx % doughnutData.datasets[0].backgroundColor.length] }} />
                    <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{cat.category_name || 'Без име'}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 600 }}>{Math.abs(parseFloat(cat.total || 0)).toFixed(2)} €</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>({Math.abs(parseFloat(cat.percentage || 0)).toFixed(1)}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {monthlyData && monthlyReport?.totals && dateRange === 'month' && (
          <div className="chart-card">
            <h2 className="chart-title">Месечен преглед</h2>
            <div className="chart-container">
              <Doughnut data={monthlyData} options={chartOptions} />
            </div>
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius)' }}>
                <span className="text-muted">Приходи:</span>
                <span className="text-income" style={{ fontWeight: 600 }}>{Math.abs(parseFloat(monthlyReport.totals.income || 0)).toFixed(2)} €</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius)' }}>
                <span className="text-muted">Разходи:</span>
                <span className="text-expense" style={{ fontWeight: 600 }}>{Math.abs(parseFloat(monthlyReport.totals.expense || 0)).toFixed(2)} €</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius)' }}>
                <span className="text-muted">Баланс:</span>
                <span style={{ fontWeight: 600, color: parseFloat(monthlyReport.totals.balance || 0) >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                  {parseFloat(monthlyReport.totals.balance || 0).toFixed(2)} €
                </span>
              </div>
            </div>
          </div>
        )}
        {!doughnutData && !monthlyData && (
          <div className="section" style={{ gridColumn: '1 / -1' }}>
            <p className="empty-state">
              {dateFrom || dateTo
                ? `Няма данни за периода ${dateFrom || 'начало'} – ${dateTo || 'край'}`
                : 'Няма данни за показване. Импортирайте транзакции или създайте нови.'}
            </p>
          </div>
        )}
      </div>

      {productAnalysis?.top_products?.length > 0 && (
        <div className="section">
          <h2 className="section-title">Най-купувани продукти</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            {productAnalysis.top_products.slice(0, 20).map((product, idx) => (
              <div key={idx} style={{ padding: '1rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>{product.product_name || 'Неизвестен продукт'}</h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Купени: {product.purchase_count || 0} пъти</p>
                <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--primary)' }}>Общо: {(product.total_spent || 0).toFixed(2)} €</p>
                {product.category && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Категория: {product.category}</p>}
              </div>
            ))}
          </div>
          {productAnalysis.ai_recommendations?.length > 0 && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--primary-light)', borderRadius: 'var(--radius)', border: '1px solid var(--primary)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.75rem' }}>AI Препоръки</h3>
              {productAnalysis.ai_recommendations.map((rec, idx) => (
                <p key={idx} style={{ margin: '0.5rem 0', fontSize: '0.9rem', lineHeight: 1.5 }}>{rec}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {spendingReport?.summary?.transaction_count > 0 && (aiAnalysisLoading || aiAnalysis) && (
        <div className="section">
          <h2 className="section-title">AI Финансов Анализ</h2>
          {aiAnalysisLoading ? (
            <div style={{ padding: '1.5rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius)' }}>
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>Моля изчакайте за детайлен анализ…</p>
            </div>
          ) : aiAnalysis ? (
            <div style={{ padding: '1.25rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius)', maxHeight: 400, overflowY: 'auto' }}>
              {aiAnalysis.split('\n').map((line, idx) => (
                <p key={idx} style={{ margin: '0.5rem 0', fontSize: '0.95rem', lineHeight: 1.6 }}>{line.trim() || '\u00A0'}</p>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {spendingReport?.summary?.transaction_count > 0 && spendingReport?.insights && (
        <div className="section">
          <h2 className="section-title">Ключови показатели</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            {spendingReport.insights.highest_spending_day?.date && (
              <div style={{ padding: '1rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius)' }}>
                <h3 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Най-висок разход (ден)</h3>
                <p style={{ fontWeight: 500, marginBottom: '0.25rem' }}>
                  {(() => {
                    try {
                      const d = new Date(String(spendingReport.insights.highest_spending_day.date));
                      return !isNaN(d.getTime()) ? d.toLocaleDateString('bg-BG') : String(spendingReport.insights.highest_spending_day.date);
                    } catch { return String(spendingReport.insights.highest_spending_day.date || ''); }
                  })()}
                </p>
                <p style={{ fontWeight: 600, color: 'var(--primary)' }}>{(parseFloat(spendingReport.insights.highest_spending_day.amount) || 0).toFixed(2)} €</p>
              </div>
            )}
            {spendingReport.insights.largest_transaction?.description && (
              <div style={{ padding: '1rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius)' }}>
                <h3 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Най-голяма транзакция</h3>
                <p style={{ fontWeight: 500, marginBottom: '0.25rem' }}>{String(spendingReport.insights.largest_transaction.description)}</p>
                <p style={{ fontWeight: 600, color: 'var(--primary)' }}>{(parseFloat(spendingReport.insights.largest_transaction.amount) || 0).toFixed(2)} €</p>
              </div>
            )}
            {spendingReport.insights.most_frequent_category?.category_name && (
              <div style={{ padding: '1rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius)' }}>
                <h3 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Най-честа категория</h3>
                <p style={{ fontWeight: 500, marginBottom: '0.25rem' }}>{String(spendingReport.insights.most_frequent_category.category_name)}</p>
                <p style={{ fontWeight: 600, color: 'var(--primary)' }}>{parseInt(spendingReport.insights.most_frequent_category.count) || 0} транзакции</p>
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


export default Reports;

