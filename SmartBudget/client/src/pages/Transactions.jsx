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
      const [txRes, catRes] = await Promise.all([
        api.get('/financial/transactions'),
        api.get('/financial/categories')
      ]);
      const transactionsData = Array.isArray(txRes.data.data)
        ? txRes.data.data
        : (txRes.data.data?.transactions || txRes.data.data || []);
      setTransactions(transactionsData);
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

  const handleDelete = async (id) => {
    if (window.confirm('Сигурни ли сте?')) {
      try {
        setLoading(true);
        await api.delete(`/financial/transactions/${id}`);
        await fetchData();
      } catch (error) {
        alert('Грешка при изтриване на транзакция: ' + (error.response?.data?.message || 'Неизвестна грешка'));
      } finally {
        setLoading(false);
      }
    }
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
        }
      });
      
      if (response.data && response.data.data) {
        const results = response.data.data.results || response.data.data;
        const imported = results.imported || 0;
        const total = results.total || 0;
        alert(`Импортирани ${imported} от ${total} транзакции`);
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
        }
      });
      setReceiptResult(response.data.data);
      fetchData();
      setReceiptText('');
      setReceiptFile(null);
    } catch (error) {
      setReceiptError(error.response?.data?.message || 'Грешка при сканиране на бележка.');
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
        <div style={styles.chartsGrid}>
          {Object.keys(dailyData).length > 0 && (
            <div style={styles.chartCard}>
              <h2 style={styles.chartTitle}>Тренд за последните 30 дни</h2>
              <div style={styles.chartContainer}>
                <Line data={lineChartData} options={chartOptions} />
              </div>
            </div>
          )}

          {topCategories.length > 0 && (
            <div style={styles.chartCard}>
              <h2 style={styles.chartTitle}>Разпределение по категории</h2>
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
                    <span style={styles.categoryAmount}>{amount.toFixed(2)} лв</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sortedMonths.length > 0 && (
            <div style={styles.chartCard}>
              <h2 style={styles.chartTitle}>Месечно сравнение</h2>
              <div style={styles.chartContainer}>
                <Bar data={barChartData} options={chartOptions} />
              </div>
            </div>
          )}
        </div>
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
              transactions.map((tx) => {
                const category = categories.find((c) => c.id === tx.category_id);
                return (
                  <tr key={tx.id} style={styles.tr}>
                    <td style={styles.td}>
                      {new Date(tx.transaction_date).toLocaleDateString('bg-BG')}
                    </td>
                    <td style={styles.td}>{tx.description}</td>
                    <td style={styles.td}>{category?.name || '-'}</td>
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
                      {parseFloat(tx.amount).toFixed(2)} лв
                    </td>
                    <td style={styles.td}>
                      <button
                        onClick={() => handleDelete(tx.id)}
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
    marginBottom: '30px',
    flexWrap: 'wrap',
    gap: '12px'
  },
  headerActions: {
    display: 'flex',
    gap: '12px'
  },
  uploadButton: {
    padding: '12px 24px',
    background: 'white',
    color: '#667eea',
    border: '2px solid #667eea',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'inline-block'
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: 'white'
  },
  addButton: {
    padding: '12px 24px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000
  },
  modal: {
    background: 'white',
    borderRadius: '16px',
    padding: '30px',
    width: '90%',
    maxWidth: '500px'
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
    padding: '12px',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    fontSize: '16px',
    outline: 'none'
  },
  select: {
    padding: '12px',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    fontSize: '16px',
    outline: 'none'
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    marginTop: '10px'
  },
  cancelButton: {
    flex: 1,
    padding: '12px',
    background: '#f5f5f5',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    cursor: 'pointer'
  },
  submitButton: {
    flex: 1,
    padding: '12px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  tableContainer: {
    background: 'white',
    borderRadius: '16px',
    padding: '20px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
    overflowX: 'auto'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  th: {
    textAlign: 'left',
    padding: '12px',
    borderBottom: '2px solid #e0e0e0',
    color: '#666',
    fontWeight: '600'
  },
  tr: {
    borderBottom: '1px solid #f0f0f0'
  },
  td: {
    padding: '12px',
    color: '#333'
  },
  badge: {
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '500'
  },
  deleteButton: {
    padding: '6px 12px',
    background: '#fee2e2',
    color: '#991b1b',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px'
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
    padding: '12px 24px',
    background: 'white',
    color: '#667eea',
    border: '2px solid #667eea',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  uploadButton: {
    padding: '12px 24px',
    background: 'white',
    color: '#667eea',
    border: '2px solid #667eea',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'inline-block'
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
  }
};

export default Transactions;

