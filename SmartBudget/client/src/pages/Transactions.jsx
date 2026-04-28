import React, { useState, useEffect } from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
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
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

const Transactions = () => {
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [receiptModal, setReceiptModal] = useState(false);
  const [receiptText, setReceiptText] = useState('');
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptResult, setReceiptResult] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [rememberCategoryRule, setRememberCategoryRule] = useState(true);
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    category_id: '',
    transaction_date: new Date().toISOString().split('T')[0],
    type: 'expense'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      const catPromise = api.get('/financial/categories');

      const allTx = [];
      const seenIds = new Set();

      const limit = 100;
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages) {
        const txRes = await api.get(`/financial/transactions?limit=${limit}&page=${page}`);
        const txPayload = txRes.data?.data;
        const pageTx = txPayload?.transactions || [];
        const pagination = txPayload?.pagination;

        if (pagination?.pages) {
          totalPages = pagination.pages;
        } else if (pageTx.length < limit) {
          totalPages = page;
        }

        for (const t of pageTx) {
          const id = t?.id;
          if (id && seenIds.has(id)) continue;
          if (id) seenIds.add(id);
          allTx.push(t);
        }

        page++;
      }

      const catRes = await catPromise;

      const sortedTransactions = [...allTx].sort((a, b) => {
        const dateA = new Date(a.transaction_date);
        const dateB = new Date(b.transaction_date);
        return dateB - dateA;
      });

      const summaryRes = await api.get('/financial/transactions/summary').catch(() => ({ data: { status: 'error', data: null } }));

      setTransactions(sortedTransactions);
      setCategories(catRes.data.data || []);
      if (summaryRes.data?.status === 'success' && summaryRes.data.data) {
        setSummary(summaryRes.data.data);
      } else {
        setSummary(null);
      }
    } catch (error) {
      setTransactions([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await api.post('/financial/transactions', formData);
      setShowModal(false);
      setFormData({
        description: '',
        amount: '',
        category_id: '',
        transaction_date: new Date().toISOString().split('T')[0],
        type: 'expense'
      });
      await fetchData();
    } catch (error) {
      alert('Грешка при създаване на транзакция: ' + (error.response?.data?.message || 'Неизвестна грешка'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (window.confirm('Сигурни ли сте?')) {
      try {
        const scrollPosition = window.scrollY || window.pageYOffset;
        
        setLoading(true);
        await api.delete(`/financial/transactions/${id}`);
        await fetchData();
        
        setTimeout(() => {
          window.scrollTo(0, scrollPosition);
        }, 100);
      } catch (error) {
        alert('Грешка при изтриване на транзакция: ' + (error.response?.data?.message || 'Неизвестна грешка'));
      } finally {
        setLoading(false);
      }
    }
  };

  const handleEditCategory = (tx) => {
    setEditingCategory(tx.id);
    setNewCategoryName('');
    setRememberCategoryRule(true);
  };

  const handleSaveCategory = async (tx) => {
    try {
      setLoading(true);
      const txCategories = categories.filter(c => c.type === tx.type);
      let categoryId = null;
      
      if (newCategoryName.trim()) {
        const existingCategory = txCategories.find(c => c.name === newCategoryName.trim());
        if (existingCategory) {
          categoryId = existingCategory.id;
        } else {
          const createRes = await api.post('/financial/categories', {
            name: newCategoryName.trim(),
            type: tx.type
          });
          if (createRes.data.status === 'success' && createRes.data.data) {
            categoryId = createRes.data.data.id;
            await fetchData();
          }
        }
      }
      
      if (categoryId) {
        await api.put(`/financial/transactions/${tx.id}`, {
          category_id: categoryId,
          remember_category: rememberCategoryRule,
          apply_to_existing: rememberCategoryRule
        });
        await fetchData();
      }
      
      setEditingCategory(null);
      setNewCategoryName('');
    } catch (error) {
      alert('Грешка при промяна на категория: ' + (error.response?.data?.message || 'Неизвестна грешка'));
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingCategory(null);
    setNewCategoryName('');
    setRememberCategoryRule(true);
  };

  const handleCSVUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('csvFile', file);

    try {
      setLoading(true);
      const response = await api.post('/financial/transactions/import-csv', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: 180000
      });
      
      if (response.data && response.data.data) {
        const results = response.data.data.results || response.data.data;
        const failed = results.failed || 0;
        const errors = results.errors || [];
        const hasErrors = failed > 0 || errors.length > 0;

        let message;
        if (!hasErrors) {
          message = 'Импортът е успешен.';
        } else {
          message = `Импортът завърши с грешки (${failed} неуспешни).`;
          if (errors.length > 0 && errors.length <= 10) {
            message += '\n\nГрешки:';
            errors.forEach((err, idx) => {
              message += `\n${idx + 1}. Ред ${err.row}: ${err.error || 'Неизвестна грешка'}`;
              if (err.description) message += `\n   Описание: ${err.description}`;
              if (err.date) message += `\n   Дата: ${err.date}`;
              if (err.amount) message += `\n   Сума: ${err.amount}`;
            });
          } else if (errors.length > 10) {
            message += `\n\nПървите 10 грешки:`;
            errors.slice(0, 10).forEach((err, idx) => {
              message += `\n${idx + 1}. Ред ${err.row}: ${err.error || 'Неизвестна грешка'}`;
            });
          }
        }

        const showDetailedPopup = () => {
          const popup = document.createElement('div');
          popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg-card);padding:1.5rem;border-radius:var(--radius-lg);box-shadow:var(--shadow-md);z-index:10000;max-width:600px;max-height:80vh;overflow-y:auto;';
          popup.className = 'modal';
          
          const title = document.createElement('h2');
          title.textContent = 'Резултати от импортиране';
          title.className = 'modal-title';
          title.style.marginBottom = '1rem';
          popup.appendChild(title);
          
          const content = document.createElement('div');
          content.style.cssText = 'margin-bottom:1rem;white-space:pre-wrap;font-size:0.9rem;line-height:1.6;color:var(--text-muted);';
          content.textContent = message;
          popup.appendChild(content);
          
          const buttonContainer = document.createElement('div');
          buttonContainer.style.cssText = 'display:flex;gap:0.75rem;justify-content:flex-end;margin-top:1rem;';
          
          const copyButton = document.createElement('button');
          copyButton.textContent = 'Копирай текста';
          copyButton.className = 'btn btn-primary';
          copyButton.style.cssText = 'padding:0.5rem 1rem;font-size:0.9rem;';
          copyButton.onclick = () => {
            navigator.clipboard.writeText(message).then(() => {
              copyButton.textContent = 'Копирано!';
              setTimeout(() => { copyButton.textContent = 'Копирай текста'; }, 2000);
            }).catch(() => {
              const textarea = document.createElement('textarea');
              textarea.value = message;
              textarea.style.cssText = 'position:fixed;opacity:0;';
              document.body.appendChild(textarea);
              textarea.select();
              document.execCommand('copy');
              document.body.removeChild(textarea);
              copyButton.textContent = 'Копирано!';
              setTimeout(() => { copyButton.textContent = 'Копирай текста'; }, 2000);
            });
          };
          buttonContainer.appendChild(copyButton);
          
          const closeButton = document.createElement('button');
          closeButton.textContent = 'Затвори';
          closeButton.className = 'btn btn-ghost';
          closeButton.style.cssText = 'padding:0.5rem 1rem;font-size:0.9rem;';
          closeButton.onclick = () => {
            document.body.removeChild(popup);
            document.body.removeChild(overlay);
          };
          buttonContainer.appendChild(closeButton);
          popup.appendChild(buttonContainer);
          
          const overlay = document.createElement('div');
          overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:9999;';
          overlay.onclick = () => {
            document.body.removeChild(popup);
            document.body.removeChild(overlay);
          };
          document.body.appendChild(overlay);
          document.body.appendChild(popup);
        };
        
        showDetailedPopup();
      } else {
      alert('CSV файлът е импортиран успешно!');
      }
      
      await fetchData();
    } catch (error) {
      alert('Грешка при импортиране: ' + (error.response?.data?.message || 'Неизвестна грешка'));
    } finally {
      setLoading(false);
    e.target.value = '';
    }
  };

  const handleReceiptScan = async (e) => {
    e.preventDefault();
    setReceiptError('');
    setReceiptLoading(true);
    setReceiptResult(null);
    try {
      const form = new FormData();
      if (receiptText.trim()) {
        form.append('receipt_text', receiptText);
      }
      if (receiptFile) {
        form.append('receiptFile', receiptFile);
      }
      if (!receiptText.trim() && !receiptFile) {
        setReceiptError('Добавете текст или файл.');
        setReceiptLoading(false);
        return;
      }
      const response = await api.post('/financial/receipts/scan', form, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: 180000
      });
      
      if (response.data && response.data.status === 'success') {
      setReceiptResult(response.data.data);
        await fetchData();
      setReceiptText('');
      setReceiptFile(null);
        
        const imported = response.data.data?.imported || 0;
        const total = response.data.data?.total || 0;
        if (imported > 0) {
          alert(`Успешно импортирани ${imported} от ${total} транзакции от бележката!`);
        }
      } else {
        setReceiptError(response.data?.message || 'Грешка при сканиране на бележка.');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Грешка при сканиране на бележка.';
      setReceiptError(errorMessage);
      
      alert(`Грешка: ${errorMessage}`);
    } finally {
      setReceiptLoading(false);
    }
  };

  if (loading) {
    return <div className="loading-screen">Зареждане…</div>;
  }

  const expenseCategories = categories.filter((c) => c.type === 'expense');
  const incomeCategories = categories.filter((c) => c.type === 'income');

  const totalIncome = summary?.totalIncome || 0;
  const totalExpense = summary?.totalExpense || 0;
  const balance = summary?.balance || (totalIncome - totalExpense);

  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const last30Days = transactions
    .filter(tx => {
      const txDate = new Date(tx.transaction_date);
      return txDate >= thirtyDaysAgo;
    })
    .sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date));

  const dailyData = {};
  for (let i = 0; i < 30; i++) {
    const date = new Date(thirtyDaysAgo);
    date.setDate(date.getDate() + i);
    const dateKey = date.toISOString().split('T')[0];
    dailyData[dateKey] = { income: 0, expense: 0 };
    }

  last30Days.forEach(tx => {
    const dateKey = tx.transaction_date;
    if (dailyData[dateKey]) {
      const amount = Math.abs(parseFloat(tx.amount || 0));
    if (tx.type === 'income') {
        dailyData[dateKey].income += amount;
    } else {
        dailyData[dateKey].expense += amount;
      }
    }
  });

  const sortedDateKeys = Object.keys(dailyData).sort();
  const lineChartData = {
    labels: sortedDateKeys.map(dateKey => {
      const date = new Date(dateKey);
      return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;
    }),
    datasets: [
      {
        label: 'Приходи',
        data: sortedDateKeys.map(dateKey => dailyData[dateKey].income),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.4,
        fill: true
      },
      {
        label: 'Разходи',
        data: sortedDateKeys.map(dateKey => dailyData[dateKey].expense),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        tension: 0.4,
        fill: true
      }
    ]
  };

  const categoryTotals = {};
  transactions.forEach(tx => {
    if (tx.type === 'expense' && tx.category_id) {
      const cat = categories.find(c => c.id === tx.category_id);
      const catName = cat?.name || 'Други';
      categoryTotals[catName] = (categoryTotals[catName] || 0) + Math.abs(parseFloat(tx.amount || 0));
    }
  });

  const topCategories = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const doughnutData = {
    labels: topCategories.map(([name]) => name),
    datasets: [{
      data: topCategories.map(([, amount]) => amount),
      backgroundColor: ['#0f766e', '#0d9488', '#14b8a6', '#5eead4', '#99f6e4'],
      borderWidth: 0
    }]
  };

  const monthlyComparison = {};
  transactions.forEach(tx => {
    const date = new Date(tx.transaction_date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyComparison[monthKey]) {
      monthlyComparison[monthKey] = { income: 0, expense: 0 };
    }
    const amount = Math.abs(parseFloat(tx.amount || 0));
    if (tx.type === 'income') {
      monthlyComparison[monthKey].income += amount;
    } else {
      monthlyComparison[monthKey].expense += amount;
    }
  });

  const sortedMonths = Object.keys(monthlyComparison).sort().slice(-6);
  const barChartData = {
    labels: sortedMonths.map(month => {
      const [year, m] = month.split('-');
      return `${m}/${year}`;
    }),
    datasets: [
      {
        label: 'Приходи',
        data: sortedMonths.map(month => monthlyComparison[month].income),
        backgroundColor: '#10b981'
      },
      {
        label: 'Разходи',
        data: sortedMonths.map(month => monthlyComparison[month].expense),
        backgroundColor: '#ef4444'
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          font: {
            size: 12,
            weight: '500'
          },
          padding: 15
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        titleFont: {
          size: 14,
          weight: 'bold'
        },
        bodyFont: {
          size: 13
        },
        displayColors: true,
        callbacks: {
          label: function(context) {
            return `${context.dataset.label}: ${context.parsed.y.toFixed(2)} €`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return value.toFixed(0) + ' €';
          },
          font: {
            size: 11
          }
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        }
      },
      x: {
        ticks: {
          font: {
            size: 11
          },
          maxRotation: 45,
          minRotation: 45
        },
        grid: {
          display: false
        }
      }
    }
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Транзакции</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button type="button" onClick={() => setReceiptModal(true)} className="btn btn-secondary">
            Сканирай бележка
          </button>
          <label className="label-as-btn">
            Импортирай CSV/PDF
            <input
              type="file"
              accept=".csv,.pdf,.txt"
              onChange={handleCSVUpload}
              style={{ display: 'none' }}
            />
          </label>
          <button type="button" onClick={() => setShowModal(true)} className="btn btn-primary">
            + Добави транзакция
          </button>
        </div>
      </div>

      {!loading && transactions.length > 0 && (
        <>
          <div className="cards-grid" style={{ marginBottom: '1.5rem' }}>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: 48, height: 48, borderRadius: 'var(--radius)', background: 'var(--bg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>💰</div>
              <div>
                <div className="card-title">Общ баланс</div>
                <div className="card-value" style={{ color: balance >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                  {balance >= 0 ? '+' : ''}{balance.toFixed(2)} €
                </div>
              </div>
            </div>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: 48, height: 48, borderRadius: 'var(--radius)', background: 'var(--income-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>📈</div>
              <div>
                <div className="card-title">Приходи</div>
                <div className="card-value text-income">{totalIncome.toFixed(2)} €</div>
              </div>
            </div>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: 48, height: 48, borderRadius: 'var(--radius)', background: 'var(--expense-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>📉</div>
              <div>
                <div className="card-title">Разходи</div>
                <div className="card-value text-expense">{totalExpense.toFixed(2)} €</div>
              </div>
            </div>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: 48, height: 48, borderRadius: 'var(--radius)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>📋</div>
              <div>
                <div className="card-title">Транзакции</div>
                <div className="card-value" style={{ color: 'var(--primary)' }}>{summary?.transactionCount ?? transactions.length}</div>
              </div>
            </div>
          </div>
          <div className="grid-cards" style={{ marginBottom: '1.5rem' }}>
            {Object.keys(dailyData).length > 0 && (
              <div className="chart-card">
                <h2 className="chart-title">Тренд за последните 30 дни</h2>
                <div className="chart-container">
                  <Line data={lineChartData} options={chartOptions} />
                </div>
              </div>
            )}
            {topCategories.length > 0 && (
              <div className="chart-card">
                <h2 className="chart-title">Разпределение по категории</h2>
                <div className="chart-container">
                  <Doughnut data={doughnutData} options={chartOptions} />
                </div>
                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {topCategories.map(([name, amount], idx) => (
                    <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: doughnutData.datasets[0].backgroundColor[idx] }} />
                        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{name}</span>
                      </div>
                      <span style={{ fontWeight: 600 }}>{Math.abs(amount).toFixed(2)} €</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {sortedMonths.length > 0 && (
              <div className="chart-card">
                <h2 className="chart-title">Месечно сравнение</h2>
                <div className="chart-container">
                  <Bar data={barChartData} options={chartOptions} />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Нова транзакция</h2>
            <form onSubmit={handleSubmit} className="form-row">
              <select
                className="select"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value, category_id: '' })}
              >
                <option value="expense">Разход</option>
                <option value="income">Приход</option>
              </select>
              <input
                type="text"
                className="input"
                placeholder="Описание"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                required
              />
              <input
                type="number"
                step="0.01"
                className="input"
                placeholder="Сума"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                required
              />
              <select
                className="select"
                value={formData.category_id}
                onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                required
              >
                <option value="">Избери категория</option>
                {(formData.type === 'expense' ? expenseCategories : incomeCategories).map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <input
                type="date"
                className="input"
                value={formData.transaction_date}
                onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
                required
              />
              <div className="form-actions">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-ghost">Отказ</button>
                <button type="submit" className="btn btn-primary">Запази</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {receiptModal && (
        <div className="modal-overlay" onClick={() => setReceiptModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Сканирай бележка</h2>
            <form onSubmit={handleReceiptScan} className="form-row">
              <textarea
                className="textarea"
                placeholder="Поставете текст от бележка"
                value={receiptText}
                onChange={(e) => setReceiptText(e.target.value)}
                rows={5}
              />
              <input
                type="file"
                accept=".txt,.text,.jpg,.jpeg,.png,.gif,.bmp,.webp"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                className="input"
              />
              {receiptError && <div className="alert-error">{receiptError}</div>}
              {receiptResult && (
                <div className="result-box">
                  <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Импортирани: {receiptResult.imported} / {receiptResult.total}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {receiptResult.results.map((item, idx) => (
                      <div key={`${item.description}-${idx}`} className="result-item">
                        <div>
                          <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{item.description}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.category || 'Без категория'}</div>
                        </div>
                        <div style={{ fontWeight: 600 }}>{item.amount.toFixed(2)} €</div>
                        <span className={`badge ${item.status === 'imported' ? 'badge-income' : 'badge-expense'}`}>{item.status === 'imported' ? 'Добавена' : 'Грешка'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="form-actions">
                <button type="button" onClick={() => setReceiptModal(false)} className="btn btn-ghost">Затвори</button>
                <button type="submit" className="btn btn-primary" disabled={receiptLoading}>
                  {receiptLoading ? 'Сканиране…' : 'Сканирай'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {!loading && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Описание</th>
                <th>Категория</th>
                <th>Тип</th>
                <th>Сума</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length > 0 ? (
                transactions.map((tx) => {
                  const category = categories.find((c) => c.id === tx.category_id);
                  return (
                    <tr key={tx.id}>
                      <td>{new Date(tx.transaction_date).toLocaleDateString('bg-BG')}</td>
                      <td>{tx.description}</td>
                      <td>
                        {editingCategory === tx.id ? (
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <select
                              className="select"
                              value={newCategoryName}
                              onChange={(e) => {
                                if (e.target.value === '__new__') {
                                  const input = prompt('Въведете име на нова категория:');
                                  if (input?.trim()) setNewCategoryName(input.trim());
                                } else setNewCategoryName(e.target.value);
                              }}
                              style={{ minWidth: 140, flex: '1 1 120px' }}
                            >
                              <option value="">Избери категория</option>
                              {categories.filter(c => c.type === tx.type).map(cat => (
                                <option key={cat.id} value={cat.name}>{cat.name}</option>
                              ))}
                              <option value="__new__">+ Нова категория</option>
                            </select>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                              <input type="checkbox" checked={rememberCategoryRule} onChange={(e) => setRememberCategoryRule(e.target.checked)} />
                              Запомни за бъдещи (и стари)
                            </label>
                            <button type="button" onClick={() => handleSaveCategory(tx)} className="btn btn-primary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}>Запази</button>
                            <button type="button" onClick={handleCancelEdit} className="btn btn-ghost" style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}>Отказ</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span>{category?.name || 'Други ' + (tx.type === 'income' ? 'приходи' : 'разходи')}</span>
                            <button type="button" onClick={() => handleEditCategory(tx)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7 }} title="Редактирай категория">✏️</button>
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={tx.type === 'income' ? 'badge badge-income' : 'badge badge-expense'}>
                          {tx.type === 'income' ? 'Приход' : 'Разход'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, color: tx.type === 'income' ? 'var(--income)' : 'var(--expense)' }}>
                        {Math.abs(parseFloat(tx.amount)).toFixed(2)} €
                      </td>
                      <td>
                        <button type="button" onClick={(e) => handleDelete(tx.id, e)} className="btn btn-danger">Изтрий</button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="6" className="empty-state" style={{ textAlign: 'center', padding: '2rem' }}>Няма транзакции</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};


export default Transactions;