import React, { useState, useEffect } from 'react';
import api from '../services/api';

const Transactions = () => {
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
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
      const [txRes, catRes] = await Promise.all([
        api.get('/financial/transactions'),
        api.get('/financial/categories')
      ]);
      setTransactions(txRes.data.data.transactions);
      setCategories(catRes.data.data);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/financial/transactions', formData);
      setShowModal(false);
      setFormData({
        description: '',
        amount: '',
        category_id: '',
        transaction_date: new Date().toISOString().split('T')[0],
        type: 'expense'
      });
      fetchData();
    } catch (error) {
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Сигурни ли сте?')) {
      try {
        await api.delete(`/financial/transactions/${id}`);
        fetchData();
      } catch (error) {
      }
    }
  };

  const handleCSVUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('csvFile', file);

    try {
      await api.post('/financial/transactions/import-csv', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      fetchData();
      alert('CSV файлът е импортиран успешно!');
    } catch (error) {
      alert('Грешка при импортиране: ' + (error.response?.data?.message || 'Неизвестна грешка'));
    }
    e.target.value = '';
  };

  if (loading) {
    return <div style={styles.loading}>Зареждане...</div>;
  }

  const expenseCategories = categories.filter((c) => c.type === 'expense');
  const incomeCategories = categories.filter((c) => c.type === 'income');

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Транзакции</h1>
        <button onClick={() => setShowModal(true)} style={styles.addButton}>
          + Добави транзакция
        </button>
      </div>

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
  }
};

export default Transactions;

