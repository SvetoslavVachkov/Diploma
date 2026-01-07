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

      setTransactions(sortedTransactions);
      setCategories(catRes.data.data || []);
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
        const imported = results.imported || 0;
        const total = results.total || 0;
        const failed = results.failed || 0;
        const skipped = results.skipped || 0;
        const errors = results.errors || [];
        const missingTransactions = results.missingTransactions || [];
        const expectedTotal = results.expectedTotal;
        
        let message = `Импортирани ${imported} от ${total} транзакции`;
        
        if (expectedTotal && expectedTotal > total) {
          message += `\n\nОчаквани са ${expectedTotal} транзакции, но са намерени само ${total}. Липсват ${expectedTotal - total} транзакции.`;
        }
        
        if (failed > 0) {
          message += `\n\nНеуспешни: ${failed}`;
        }
        
        if (skipped > 0) {
          message += `\n\nПропуснати: ${skipped}`;
        }
        
        if (missingTransactions.length > 0) {
          message += '\n\nПричини за липсващи транзакции:';
          missingTransactions.forEach((missing, idx) => {
            message += `\n${idx + 1}. ${missing.reason}`;
            if (missing.date) {
              message += `\n   Дата: ${missing.date}`;
            }
            if (missing.description) {
              message += `\n   Описание: ${missing.description}`;
            }
            if (missing.amount) {
              message += `\n   Сума: ${missing.amount}`;
            }
          });
        }
        
        if (errors.length > 0 && errors.length <= 10) {
          message += '\n\nГрешки при импортиране:';
          errors.forEach((err, idx) => {
            message += `\n${idx + 1}. Ред ${err.row}: ${err.error || 'Неизвестна грешка'}`;
            if (err.description) {
              message += `\n   Описание: ${err.description}`;
            }
            if (err.date) {
              message += `\n   Дата: ${err.date}`;
            }
            if (err.amount) {
              message += `\n   Сума: ${err.amount}`;
            }
          });
        } else if (errors.length > 10) {
          message += `\n\nИма ${errors.length} грешки при импортиране. Първите 10:`;
          errors.slice(0, 10).forEach((err, idx) => {
            message += `\n${idx + 1}. Ред ${err.row}: ${err.error || 'Неизвестна грешка'}`;
            if (err.description) {
              message += `\n   Описание: ${err.description}`;
            }
            if (err.date) {
              message += `\n   Дата: ${err.date}`;
            }
            if (err.amount) {
              message += `\n   Сума: ${err.amount}`;
            }
          });
        }
        
        const showDetailedPopup = () => {
          const popup = document.createElement('div');
          popup.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 24px;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            z-index: 10000;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          `;
          
          const title = document.createElement('h2');
          title.textContent = 'Резултати от импортиране';
          title.style.cssText = 'margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: #1f2937;';
          popup.appendChild(title);
          
          const content = document.createElement('div');
          content.style.cssText = 'margin-bottom: 16px; white-space: pre-wrap; font-size: 14px; line-height: 1.6; color: #374151;';
          content.textContent = message;
          popup.appendChild(content);
          
          const buttonContainer = document.createElement('div');
          buttonContainer.style.cssText = 'display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px;';
          
          const copyButton = document.createElement('button');
          copyButton.textContent = 'Копирай текста';
          copyButton.style.cssText = `
            padding: 10px 20px;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: background 0.2s;
          `;
          copyButton.onmouseover = () => copyButton.style.background = '#2563eb';
          copyButton.onmouseout = () => copyButton.style.background = '#3b82f6';
          copyButton.onclick = () => {
            navigator.clipboard.writeText(message).then(() => {
              copyButton.textContent = 'Копирано!';
              setTimeout(() => {
                copyButton.textContent = 'Копирай текста';
              }, 2000);
            }).catch(() => {
              const textarea = document.createElement('textarea');
              textarea.value = message;
              textarea.style.position = 'fixed';
              textarea.style.opacity = '0';
              document.body.appendChild(textarea);
              textarea.select();
              document.execCommand('copy');
              document.body.removeChild(textarea);
              copyButton.textContent = 'Копирано!';
              setTimeout(() => {
                copyButton.textContent = 'Копирай текста';
              }, 2000);
            });
          };
          buttonContainer.appendChild(copyButton);
          
          const closeButton = document.createElement('button');
          closeButton.textContent = 'Затвори';
          closeButton.style.cssText = `
            padding: 10px 20px;
            background: #6b7280;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: background 0.2s;
          `;
          closeButton.onmouseover = () => closeButton.style.background = '#4b5563';
          closeButton.onmouseout = () => closeButton.style.background = '#6b7280';
          closeButton.onclick = () => {
            document.body.removeChild(popup);
            document.body.removeChild(overlay);
          };
          buttonContainer.appendChild(closeButton);
          
          popup.appendChild(buttonContainer);
          
          const overlay = document.createElement('div');
          overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 9999;
          `;
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
      console.error('Receipt scan error:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Грешка при сканиране на бележка.';
      setReceiptError(errorMessage);
      
      alert(`Грешка: ${errorMessage}`);
    } finally {
      setReceiptLoading(false);
    }
  };

  if (loading) {
    return <div style={styles.loading}>Зареждане...</div>;
  }

  const expenseCategories = categories.filter((c) => c.type === 'expense');
  const incomeCategories = categories.filter((c) => c.type === 'income');

  const totalIncome = transactions
    .filter(tx => tx.type === 'income')
    .reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);

  const totalExpense = transactions
    .filter(tx => tx.type === 'expense')
    .reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);

  const balance = totalIncome - totalExpense;

  const last30Days = transactions
    .filter(tx => {
      const txDate = new Date(tx.transaction_date);
      const daysAgo = (Date.now() - txDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysAgo <= 30;
    })
    .sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date));

  const dailyData = {};
  last30Days.forEach(tx => {
    const date = new Date(tx.transaction_date).toLocaleDateString('bg-BG');
    if (!dailyData[date]) {
      dailyData[date] = { income: 0, expense: 0 };
    }
    if (tx.type === 'income') {
      dailyData[date].income += parseFloat(tx.amount || 0);
    } else {
      dailyData[date].expense += parseFloat(tx.amount || 0);
    }
  });

  const lineChartData = {
    labels: Object.keys(dailyData),
    datasets: [
      {
        label: 'Приходи',
        data: Object.values(dailyData).map(d => d.income),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.4
      },
      {
        label: 'Разходи',
        data: Object.values(dailyData).map(d => d.expense),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        tension: 0.4
      }
    ]
  };

  const categoryTotals = {};
  transactions.forEach(tx => {
    if (tx.type === 'expense' && tx.category_id) {
      const cat = categories.find(c => c.id === tx.category_id);
      const catName = cat?.name || 'Други';
      categoryTotals[catName] = (categoryTotals[catName] || 0) + parseFloat(tx.amount || 0);
    }
  });

  const topCategories = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const doughnutData = {
    labels: topCategories.map(([name]) => name),
    datasets: [{
      data: topCategories.map(([, amount]) => amount),
      backgroundColor: [
        '#667eea',
        '#764ba2',
        '#f093fb',
        '#4facfe',
        '#00f2fe'
      ],
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
    if (tx.type === 'income') {
      monthlyComparison[monthKey].income += parseFloat(tx.amount || 0);
    } else {
      monthlyComparison[monthKey].expense += parseFloat(tx.amount || 0);
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
        position: 'top'
      }
    }
  };

  return (
    <div>
      <style>{animationStyles}</style>
      <div style={styles.header}>
        <h1 style={styles.title}>Транзакции</h1>
        <div style={styles.headerActions}>
          <button onClick={() => setReceiptModal(true)} style={styles.secondaryButton}>
            Сканирай бележка
          </button>
          <label style={styles.uploadButton}>
            Импортирай CSV/PDF
            <input
              type="file"
              accept=".csv,.pdf,.txt"
              onChange={handleCSVUpload}
              style={{ display: 'none' }}
            />
          </label>
          <button onClick={() => setShowModal(true)} style={styles.addButton}>
            + Добави транзакция
          </button>
        </div>
      </div>

      {!loading && transactions.length > 0 && (
        <>
          <div style={styles.summaryCards}>
            <div style={styles.summaryCard}>
              <div style={styles.summaryIcon}>💰</div>
              <div style={styles.summaryContent}>
                <div style={styles.summaryLabel}>Общ баланс</div>
                <div style={{...styles.summaryValue, color: balance >= 0 ? '#10b981' : '#ef4444'}}>
                  {balance >= 0 ? '+' : ''}{balance.toFixed(2)} €
                </div>
              </div>
            </div>
            <div style={styles.summaryCard}>
              <div style={{...styles.summaryIcon, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)'}}>📈</div>
              <div style={styles.summaryContent}>
                <div style={styles.summaryLabel}>Приходи</div>
                <div style={{...styles.summaryValue, color: '#10b981'}}>
                  +{totalIncome.toFixed(2)} €
                </div>
              </div>
            </div>
            <div style={styles.summaryCard}>
              <div style={{...styles.summaryIcon, background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'}}>📉</div>
              <div style={styles.summaryContent}>
                <div style={styles.summaryLabel}>Разходи</div>
                <div style={{...styles.summaryValue, color: '#ef4444'}}>
                  -{totalExpense.toFixed(2)} €
                </div>
              </div>
            </div>
            <div style={styles.summaryCard}>
              <div style={{...styles.summaryIcon, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}}>📋</div>
              <div style={styles.summaryContent}>
                <div style={styles.summaryLabel}>Транзакции</div>
                <div style={{...styles.summaryValue, color: '#667eea'}}>
                  {transactions.length}
                </div>
              </div>
            </div>
          </div>
          <div style={styles.chartsGrid}>
          {Object.keys(dailyData).length > 0 && (
            <div style={styles.chartCard} className="chart-card">
              <h2 style={styles.chartTitle}>📈 Тренд за последните 30 дни</h2>
              <div style={styles.chartContainer}>
                <Line data={lineChartData} options={chartOptions} />
              </div>
            </div>
          )}

          {topCategories.length > 0 && (
            <div style={styles.chartCard} className="chart-card">
              <h2 style={styles.chartTitle}>🎯 Разпределение по категории</h2>
              <div style={styles.chartContainer}>
                <Doughnut data={doughnutData} options={chartOptions} />
              </div>
              <div style={styles.categoryList}>
                {topCategories.map(([name, amount], idx) => (
                  <div key={name} style={styles.categoryItem}>
                    <div style={styles.categoryInfo}>
                      <div
                        style={{
                          ...styles.categoryColor,
                          background: doughnutData.datasets[0].backgroundColor[idx]
                        }}
                      />
                      <span style={styles.categoryName}>{name}</span>
                    </div>
                    <span style={styles.categoryAmount}>{Math.abs(amount).toFixed(2)} €</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sortedMonths.length > 0 && (
            <div style={styles.chartCard} className="chart-card">
              <h2 style={styles.chartTitle}>📊 Месечно сравнение</h2>
              <div style={styles.chartContainer}>
                <Bar data={barChartData} options={chartOptions} />
              </div>
            </div>
          )}
        </div>
        </>
      )}

      {showModal && (
        <div style={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Нова транзакция</h2>
            <form onSubmit={handleSubmit} style={styles.form}>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value, category_id: '' })}
                style={styles.select}
              >
                <option value="expense">Разход</option>
                <option value="income">Приход</option>
              </select>
              <input
                type="text"
                placeholder="Описание"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                required
                style={styles.input}
              />
              <input
                type="number"
                step="0.01"
                placeholder="Сума"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                required
                style={styles.input}
              />
              <select
                value={formData.category_id}
                onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                required
                style={styles.select}
              >
                <option value="">Избери категория</option>
                {(formData.type === 'expense' ? expenseCategories : incomeCategories).map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={formData.transaction_date}
                onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
                required
                style={styles.input}
              />
              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowModal(false)} style={styles.cancelButton}>
                  Отказ
                </button>
                <button type="submit" style={styles.submitButton}>
                  Запази
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {receiptModal && (
        <div style={styles.modalOverlay} onClick={() => setReceiptModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Сканирай бележка</h2>
            <form onSubmit={handleReceiptScan} style={styles.form}>
              <textarea
                placeholder="Поставете текст от бележка"
                value={receiptText}
                onChange={(e) => setReceiptText(e.target.value)}
                style={styles.textarea}
                rows={5}
              />
              <input
                type="file"
                accept=".txt"
                onChange={(e) => setReceiptFile(e.target.files[0])}
                style={styles.input}
              />
              {receiptError && <div style={styles.errorBox}>{receiptError}</div>}
              {receiptResult && (
                <div style={styles.resultBox}>
                  <p style={styles.resultTitle}>Импортирани: {receiptResult.imported} / {receiptResult.total}</p>
                  <div style={styles.resultList}>
                    {receiptResult.results.map((item, idx) => (
                      <div key={`${item.description}-${idx}`} style={styles.resultItem}>
                        <div>
                          <div style={styles.resultDesc}>{item.description}</div>
                          <div style={styles.resultCategory}>{item.category || 'Без категория'}</div>
                        </div>
                        <div style={styles.resultAmount}>{item.amount.toFixed(2)} лв</div>
                        <div style={styles.resultStatus}>{item.status === 'imported' ? 'Добавена' : 'Грешка'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={styles.modalActions}>
                <button type="button" onClick={() => setReceiptModal(false)} style={styles.cancelButton}>
                  Затвори
                </button>
                <button type="submit" style={styles.submitButton} disabled={receiptLoading}>
                  {receiptLoading ? 'Сканиране...' : 'Сканирай'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {!loading && (
        <div style={styles.tableContainer}>
          <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Дата</th>
              <th style={styles.th}>Описание</th>
              <th style={styles.th}>Категория</th>
              <th style={styles.th}>Тип</th>
              <th style={styles.th}>Сума</th>
              <th style={styles.th}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length > 0 ? (
              transactions.map((tx, index) => {
                const category = categories.find((c) => c.id === tx.category_id);
                return (
                  <tr key={tx.id} style={{...styles.tr, animationDelay: `${index * 0.03}s`}}>
                    <td style={styles.td}>
                      {new Date(tx.transaction_date).toLocaleDateString('bg-BG')}
                    </td>
                    <td style={styles.td}>{tx.description}</td>
                    <td style={styles.td}>
                      {editingCategory === tx.id ? (
                        <div style={styles.editCategoryContainer}>
                          <select
                            value={newCategoryName}
                            onChange={(e) => {
                              if (e.target.value === '__new__') {
                                const input = prompt('Въведете име на нова категория:');
                                if (input && input.trim()) {
                                  setNewCategoryName(input.trim());
                                }
                              } else {
                                setNewCategoryName(e.target.value);
                              }
                            }}
                            style={styles.categorySelect}
                          >
                            <option value="">Избери категория</option>
                            {categories.filter(c => c.type === tx.type).map(cat => (
                              <option key={cat.id} value={cat.name}>{cat.name}</option>
                            ))}
                            <option value="__new__">+ Нова категория</option>
                          </select>
                          <label style={styles.rememberRuleLabel}>
                            <input
                              type="checkbox"
                              checked={rememberCategoryRule}
                              onChange={(e) => setRememberCategoryRule(e.target.checked)}
                              style={styles.rememberRuleCheckbox}
                            />
                            Запомни за бъдещи (и стари) транзакции
                          </label>
                          <button
                            onClick={() => handleSaveCategory(tx)}
                            style={styles.saveButton}
                          >
                            Запази
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            style={styles.cancelEditButton}
                          >
                            Отказ
                          </button>
                        </div>
                      ) : (
                        <div style={styles.categoryCell}>
                          <span>{category?.name || 'Други ' + (tx.type === 'income' ? 'приходи' : 'разходи')}</span>
                          <button
                            onClick={() => handleEditCategory(tx)}
                            style={styles.editButton}
                            title="Редактирай категория"
                          >
                            ✏️
                          </button>
                        </div>
                      )}
                    </td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.badge,
                          background: tx.type === 'income' ? '#d1fae5' : '#fee2e2',
                          color: tx.type === 'income' ? '#065f46' : '#991b1b'
                        }}
                      >
                        {tx.type === 'income' ? 'Приход' : 'Разход'}
                      </span>
                    </td>
                    <td
                      style={{
                        ...styles.td,
                        fontWeight: 'bold',
                        color: tx.type === 'income' ? '#10b981' : '#ef4444'
                      }}
                    >
                      {tx.type === 'income' ? '+' : '-'}
                      {parseFloat(tx.amount).toFixed(2)} €
                    </td>
                    <td style={styles.td}>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(tx.id, e)}
                        style={styles.deleteButton}
                      >
                        Изтрий
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="6" style={styles.emptyCell}>
                  Няма транзакции
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
};

const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '40px',
    flexWrap: 'wrap',
    gap: '16px',
    animation: 'fadeInDown 0.6s ease-out',
    padding: '20px 0',
    position: 'relative',
    zIndex: 10
  },
  title: {
    fontSize: '36px',
    fontWeight: '700',
    color: '#ffffff',
    textShadow: '0 2px 8px rgba(0, 0, 0, 0.3), 0 0 20px rgba(102, 126, 234, 0.5)',
    margin: 0,
    padding: 0,
    lineHeight: '1.2'
  },
  addButton: {
    padding: '14px 28px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
    transition: 'all 0.3s ease',
    transform: 'translateY(0)',
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 6px 20px rgba(102, 126, 234, 0.5)'
    }
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    animation: 'fadeIn 0.3s ease-out',
    backdropFilter: 'blur(4px)'
  },
  modal: {
    background: 'white',
    borderRadius: '20px',
    padding: '40px',
    width: '90%',
    maxWidth: '550px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    animation: 'slideUp 0.4s ease-out',
    transform: 'translateY(0)'
  },
  modalTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '20px',
    color: '#333'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  input: {
    padding: '14px 16px',
    border: '2px solid #e0e0e0',
    borderRadius: '12px',
    fontSize: '16px',
    outline: 'none',
    transition: 'all 0.3s ease',
    ':focus': {
      borderColor: '#667eea',
      boxShadow: '0 0 0 3px rgba(102, 126, 234, 0.1)'
    }
  },
  select: {
    padding: '14px 16px',
    border: '2px solid #e0e0e0',
    borderRadius: '12px',
    fontSize: '16px',
    outline: 'none',
    transition: 'all 0.3s ease',
    background: 'white',
    cursor: 'pointer',
    ':focus': {
      borderColor: '#667eea',
      boxShadow: '0 0 0 3px rgba(102, 126, 234, 0.1)'
    }
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    marginTop: '10px'
  },
  cancelButton: {
    flex: 1,
    padding: '14px',
    background: '#f5f5f5',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    fontWeight: '500',
    ':hover': {
      background: '#e5e5e5',
      transform: 'translateY(-1px)'
    }
  },
  submitButton: {
    flex: 1,
    padding: '14px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 6px 20px rgba(102, 126, 234, 0.5)'
    },
    ':disabled': {
      opacity: 0.6,
      cursor: 'not-allowed',
      transform: 'none'
    }
  },
  tableContainer: {
    background: 'white',
    borderRadius: '20px',
    padding: '30px',
    boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
    overflowX: 'auto',
    animation: 'fadeInUp 0.6s ease-out',
    marginTop: '30px'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  th: {
    textAlign: 'left',
    padding: '16px',
    borderBottom: '3px solid #e5e7eb',
    color: '#374151',
    fontWeight: '700',
    fontSize: '14px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)'
  },
  tr: {
    borderBottom: '1px solid #e5e7eb',
    transition: 'all 0.2s ease',
    animation: 'fadeInRow 0.4s ease-out',
    background: 'white',
    ':hover': {
      background: 'linear-gradient(90deg, #f9fafb 0%, #ffffff 100%)',
      transform: 'translateX(2px)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
    }
  },
  td: {
    padding: '16px',
    color: '#1f2937',
    fontSize: '15px'
  },
  badge: {
    padding: '8px 16px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: '700',
    display: 'inline-block',
    boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
    transition: 'all 0.2s ease',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  deleteButton: {
    padding: '8px 16px',
    background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
    color: '#991b1b',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 4px rgba(153, 27, 27, 0.2)',
    ':hover': {
      transform: 'translateY(-1px)',
      boxShadow: '0 4px 8px rgba(153, 27, 27, 0.3)'
    }
  },
  categoryCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  editButton: {
    padding: '4px 8px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    opacity: 0.6
  },
  editCategoryContainer: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    flexWrap: 'wrap'
  },
  categorySelect: {
    padding: '6px 12px',
    border: '2px solid #e0e0e0',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
    minWidth: '150px'
  },
  saveButton: {
    padding: '6px 12px',
    background: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  cancelEditButton: {
    padding: '6px 12px',
    background: '#f5f5f5',
    color: '#666',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  rememberRuleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: '#374151',
    whiteSpace: 'nowrap'
  },
  rememberRuleCheckbox: {
    width: '16px',
    height: '16px'
  },
  emptyCell: {
    textAlign: 'center',
    padding: '40px',
    color: '#666'
  },
  loading: {
    textAlign: 'center',
    color: 'white',
    fontSize: '18px',
    padding: '40px'
  },
  headerActions: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center'
  },
  secondaryButton: {
    padding: '14px 28px',
    background: 'white',
    color: '#667eea',
    border: '2px solid #667eea',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 8px rgba(102, 126, 234, 0.2)',
    ':hover': {
      background: '#667eea',
      color: 'white',
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
    }
  },
  uploadButton: {
    padding: '14px 28px',
    background: 'white',
    color: '#667eea',
    border: '2px solid #667eea',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'inline-block',
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 8px rgba(102, 126, 234, 0.2)',
    ':hover': {
      background: '#667eea',
      color: 'white',
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
    }
  },
  errorBox: {
    background: '#fee2e2',
    color: '#991b1b',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '14px'
  },
  textarea: {
    padding: '12px',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    fontSize: '16px',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit'
  },
  resultBox: {
    background: '#f9fafb',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px'
  },
  resultTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '12px'
  },
  resultList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  resultItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    background: 'white',
    borderRadius: '6px',
    border: '1px solid #e0e0e0'
  },
  resultDesc: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#333',
    marginBottom: '4px'
  },
  resultCategory: {
    fontSize: '12px',
    color: '#666'
  },
  resultAmount: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#333',
    marginRight: '12px'
  },
  resultStatus: {
    fontSize: '12px',
    padding: '4px 8px',
    borderRadius: '4px',
    background: '#d1fae5',
    color: '#065f46'
  },
  chartsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
    gap: '24px',
    marginBottom: '40px',
    animation: 'fadeInUp 0.6s ease-out'
  },
  chartCard: {
    background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
    borderRadius: '20px',
    padding: '30px',
    boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
    transition: 'all 0.3s ease',
    border: '1px solid rgba(102, 126, 234, 0.1)',
    animation: 'slideIn 0.5s ease-out',
    ':hover': {
      transform: 'translateY(-4px)',
      boxShadow: '0 12px 40px rgba(0,0,0,0.15)'
    }
  },
  chartTitle: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: '20px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    textShadow: 'none'
  },
  chartContainer: {
    height: '300px',
    position: 'relative',
    animation: 'fadeIn 0.8s ease-out'
  },
  categoryList: {
    marginTop: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  categoryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    transition: 'all 0.2s ease',
    animation: 'fadeInLeft 0.5s ease-out',
    ':hover': {
      transform: 'translateX(4px)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.12)'
    }
  },
  categoryInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  categoryColor: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
  },
  categoryName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151'
  },
  categoryAmount: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#1f2937'
  },
  summaryCards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
    marginBottom: '40px',
    animation: 'fadeInDown 0.6s ease-out'
  },
  summaryCard: {
    background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
    borderRadius: '20px',
    padding: '24px',
    boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    border: '1px solid rgba(102, 126, 234, 0.1)',
    animation: 'slideIn 0.5s ease-out',
    ':hover': {
      transform: 'translateY(-4px)',
      boxShadow: '0 12px 40px rgba(0,0,0,0.15)'
    }
  },
  summaryIcon: {
    width: '60px',
    height: '60px',
    borderRadius: '16px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '28px',
    boxShadow: '0 4px 15px rgba(102, 126, 234, 0.3)'
  },
  summaryContent: {
    flex: 1
  },
  summaryLabel: {
    fontSize: '14px',
    color: '#6b7280',
    fontWeight: '500',
    marginBottom: '8px'
  },
  summaryValue: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1f2937'
  }
};

const animationStyles = `
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  
  @keyframes fadeInDown {
    from {
      opacity: 0;
      transform: translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  
  @keyframes fadeInLeft {
    from {
      opacity: 0;
      transform: translateX(-10px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  
  @keyframes fadeInRow {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  
  button:hover {
    transform: translateY(-2px);
    transition: all 0.3s ease;
  }
  
  button:active {
    transform: translateY(0);
  }
  
  tr:hover {
    background: #f9fafb !important;
    transition: all 0.2s ease;
  }
  
  .chart-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 40px rgba(0,0,0,0.15) !important;
  }
`;

export default Transactions;

