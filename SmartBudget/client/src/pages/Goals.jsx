import React, { useState, useEffect } from 'react';
import api from '../services/api';

const Goals = () => {
  const [goals, setGoals] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    target_amount: '',
    current_amount: '0',
    target_date: '',
    goal_type: 'savings'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [goalsRes, summaryRes] = await Promise.all([
        api.get('/financial/goals'),
        api.get('/financial/goals/summary')
      ]);
      setGoals(goalsRes.data.data || []);
      setSummary(summaryRes.data.data || null);
    } catch (error) {
      console.error('Error fetching goals:', error);
      setGoals([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/financial/goals', formData);
      setShowModal(false);
      setFormData({
        title: '',
        description: '',
        target_amount: '',
        current_amount: '0',
        target_date: '',
        goal_type: 'savings'
      });
      fetchData();
    } catch (error) {
      console.error('Error creating goal:', error);
      alert('Грешка при създаване на цел: ' + (error.response?.data?.message || 'Неизвестна грешка'));
    }
  };

  const handleAddAmount = async (goalId, amount) => {
    try {
      await api.post(`/financial/goals/${goalId}/add`, { amount });
      fetchData();
    } catch (error) {
      console.error('Error adding to goal:', error);
      alert('Грешка при добавяне на сума: ' + (error.response?.data?.message || 'Неизвестна грешка'));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Сигурни ли сте?')) {
      try {
        await api.delete(`/financial/goals/${id}`);
        fetchData();
      } catch (error) {
        console.error('Error deleting goal:', error);
        alert('Грешка при изтриване на цел: ' + (error.response?.data?.message || 'Неизвестна грешка'));
      }
    }
  };

  if (loading) {
    return <div style={styles.loading}>Зареждане...</div>;
  }

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Финансови цели</h1>
        <button onClick={() => setShowModal(true)} style={styles.addButton}>
          + Нова цел
        </button>
      </div>

      {summary && (
        <div style={styles.summaryCards}>
          <div style={styles.summaryCard}>
            <h3 style={styles.summaryTitle}>Общо цели</h3>
            <p style={styles.summaryValue}>{summary.total_goals}</p>
          </div>
          <div style={styles.summaryCard}>
            <h3 style={styles.summaryTitle}>Активни</h3>
            <p style={styles.summaryValue}>{summary.active_goals}</p>
          </div>
          <div style={styles.summaryCard}>
            <h3 style={styles.summaryTitle}>Постигнати</h3>
            <p style={styles.summaryValue}>{summary.achieved_goals}</p>
          </div>
          <div style={styles.summaryCard}>
            <h3 style={styles.summaryTitle}>Общ прогрес</h3>
            <p style={styles.summaryValue}>{summary.total_progress.toFixed(1)}%</p>
          </div>
        </div>
      )}

      {showModal && (
        <div style={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Нова цел</h2>
            <form onSubmit={handleSubmit} style={styles.form}>
              <input
                type="text"
                placeholder="Заглавие"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                style={styles.input}
              />
              <textarea
                placeholder="Описание"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                style={styles.textarea}
                rows="3"
              />
              <select
                value={formData.goal_type}
                onChange={(e) => setFormData({ ...formData, goal_type: e.target.value })}
                style={styles.select}
              >
                <option value="savings">Спестяване</option>
                <option value="debt_payoff">Изплащане на дълг</option>
                <option value="investment">Инвестиция</option>
                <option value="purchase">Покупка</option>
              </select>
              <input
                type="number"
                step="0.01"
                placeholder="Целева сума"
                value={formData.target_amount}
                onChange={(e) => setFormData({ ...formData, target_amount: e.target.value })}
                required
                style={styles.input}
              />
              <input
                type="date"
                placeholder="Целева дата"
                value={formData.target_date}
                onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
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

      <div style={styles.goalsGrid}>
        {goals.length > 0 ? (
          goals.map((goal) => (
            <div key={goal.id} style={styles.goalCard}>
              <div style={styles.goalHeader}>
                <h3 style={styles.goalTitle}>{goal.title}</h3>
                <button
                  onClick={() => handleDelete(goal.id)}
                  style={styles.deleteButton}
                >
                  ×
                </button>
              </div>
              {goal.description && (
                <p style={styles.goalDescription}>{goal.description}</p>
              )}
              <div style={styles.progressContainer}>
                <div style={styles.progressBar}>
                  <div
                    style={{
                      ...styles.progressFill,
                      width: `${Math.min(100, goal.progress)}%`,
                      background: goal.is_achieved
                        ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                        : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                    }}
                  />
                </div>
                <div style={styles.progressInfo}>
                  <span style={styles.progressText}>
                    {parseFloat(goal.current_amount).toFixed(2)} / {parseFloat(goal.target_amount).toFixed(2)} лв
                  </span>
                  <span style={styles.progressPercent}>{goal.progress.toFixed(1)}%</span>
                </div>
              </div>
              <div style={styles.goalMeta}>
                <span style={styles.goalType}>{goal.goal_type}</span>
                {goal.target_date && (
                  <span style={styles.goalDate}>
                    До: {new Date(goal.target_date).toLocaleDateString('bg-BG')}
                    {goal.days_remaining !== null && (
                      <span style={styles.daysRemaining}>
                        ({goal.days_remaining > 0 ? `${goal.days_remaining} дни` : 'Изтекла'})
                      </span>
                    )}
                  </span>
                )}
              </div>
              {!goal.is_achieved && (
                <div style={styles.addAmountContainer}>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Добави сума"
                    id={`amount-${goal.id}`}
                    style={styles.amountInput}
                  />
                  <button
                    onClick={() => {
                      const input = document.getElementById(`amount-${goal.id}`);
                      if (input.value) {
                        handleAddAmount(goal.id, input.value);
                        input.value = '';
                      }
                    }}
                    style={styles.addAmountButton}
                  >
                    Добави
                  </button>
                </div>
              )}
              {goal.is_achieved && (
                <div style={styles.achievedBadge}>✓ Постигната</div>
              )}
            </div>
          ))
        ) : (
          <div style={styles.empty}>Няма цели</div>
        )}
      </div>
    </div>
  );
};

const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '30px'
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
  summaryCards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginBottom: '30px'
  },
  summaryCard: {
    background: 'white',
    borderRadius: '16px',
    padding: '20px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
  },
  summaryTitle: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '8px'
  },
  summaryValue: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#333'
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
  textarea: {
    padding: '12px',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    fontSize: '16px',
    outline: 'none',
    resize: 'vertical'
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
  goalsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: '20px'
  },
  goalCard: {
    background: 'white',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
  },
  goalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px'
  },
  goalTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#333',
    flex: 1
  },
  deleteButton: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    color: '#999',
    cursor: 'pointer',
    padding: '0',
    width: '24px',
    height: '24px',
    lineHeight: '24px'
  },
  goalDescription: {
    color: '#666',
    marginBottom: '16px',
    fontSize: '14px'
  },
  progressContainer: {
    marginBottom: '16px'
  },
  progressBar: {
    height: '8px',
    background: '#f0f0f0',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '8px'
  },
  progressFill: {
    height: '100%',
    transition: 'width 0.3s'
  },
  progressInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
    color: '#666'
  },
  progressText: {
    fontWeight: '500'
  },
  progressPercent: {
    fontWeight: 'bold',
    color: '#667eea'
  },
  goalMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '16px',
    fontSize: '12px',
    color: '#999'
  },
  goalType: {
    textTransform: 'capitalize'
  },
  goalDate: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  daysRemaining: {
    color: '#666'
  },
  addAmountContainer: {
    display: 'flex',
    gap: '8px',
    marginTop: '16px'
  },
  amountInput: {
    flex: 1,
    padding: '8px 12px',
    border: '2px solid #e0e0e0',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none'
  },
  addAmountButton: {
    padding: '8px 16px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer'
  },
  achievedBadge: {
    textAlign: 'center',
    padding: '8px',
    background: '#d1fae5',
    color: '#065f46',
    borderRadius: '6px',
    fontWeight: '600',
    marginTop: '16px'
  },
  empty: {
    gridColumn: '1 / -1',
    textAlign: 'center',
    color: 'white',
    padding: '60px',
    fontSize: '18px'
  },
  loading: {
    textAlign: 'center',
    color: 'white',
    fontSize: '18px',
    padding: '40px'
  }
};

export default Goals;

