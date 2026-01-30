import React, { useState, useEffect } from 'react';
import api from '../services/api';

const Goals = () => {
  const [goals, setGoals] = useState([]);
  const [summary, setSummary] = useState(null);
  const [advice, setAdvice] = useState(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
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
    fetchAdvice();
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
      setGoals([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchAdvice = async () => {
    try {
      setAdviceLoading(true);
      const response = await api.get('/financial/goals/advice');
      if (response.data.status === 'success') {
        setAdvice(response.data.data);
      }
    } catch (error) {
      setAdvice(null);
    } finally {
      setAdviceLoading(false);
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
      alert('Грешка при създаване на цел: ' + (error.response?.data?.message || 'Неизвестна грешка'));
    }
  };

  const handleAddAmount = async (goalId, amount) => {
    try {
      await api.post(`/financial/goals/${goalId}/add`, { amount });
      fetchData();
    } catch (error) {
      alert('Грешка при добавяне на сума: ' + (error.response?.data?.message || 'Неизвестна грешка'));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Сигурни ли сте?')) {
      try {
        await api.delete(`/financial/goals/${id}`);
        fetchData();
      } catch (error) {
        alert('Грешка при изтриване на цел: ' + (error.response?.data?.message || 'Неизвестна грешка'));
      }
    }
  };

  if (loading) {
    return <div className="loading-screen">Зареждане…</div>;
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Финансови цели</h1>
        <button type="button" onClick={() => setShowModal(true)} className="btn btn-primary">
          + Нова цел
        </button>
      </div>

      {summary && (
        <div className="cards-grid" style={{ marginBottom: '1.5rem' }}>
          <div className="card">
            <h3 className="card-title">Общо цели</h3>
            <p className="card-value">{summary.total_goals}</p>
          </div>
          <div className="card">
            <h3 className="card-title">Активни</h3>
            <p className="card-value">{summary.active_goals}</p>
          </div>
          <div className="card">
            <h3 className="card-title">Постигнати</h3>
            <p className="card-value">{summary.achieved_goals}</p>
          </div>
          <div className="card">
            <h3 className="card-title">Общ прогрес</h3>
            <p className="card-value">{Number(summary.total_progress).toFixed(1)}%</p>
          </div>
        </div>
      )}

      {(adviceLoading || (advice?.advice?.length > 0)) && (
        <div className="section" style={{ marginBottom: '1.5rem' }}>
          <h2 className="section-title">AI Съвети за постигане на цели</h2>
          {adviceLoading ? (
            <p className="empty-state">Зареждане на съвети…</p>
          ) : advice?.advice?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {advice.advice.map((tip, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.75rem',
                    padding: '0.75rem 1rem',
                    background: 'var(--primary-light)',
                    borderRadius: 'var(--radius)',
                    borderLeft: '4px solid var(--primary)'
                  }}
                >
                  <span style={{ flexShrink: 0 }}>💡</span>
                  <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.5 }}>{tip}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">Няма налични съвети</p>
          )}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Нова цел</h2>
            <form onSubmit={handleSubmit} className="form-row">
              <input
                type="text"
                className="input"
                placeholder="Заглавие"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
              <textarea
                className="textarea"
                placeholder="Описание"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
              <select
                className="select"
                value={formData.goal_type}
                onChange={(e) => setFormData({ ...formData, goal_type: e.target.value })}
              >
                <option value="savings">Спестяване</option>
                <option value="debt_payoff">Изплащане на дълг</option>
                <option value="investment">Инвестиция</option>
                <option value="purchase">Покупка</option>
              </select>
              <input
                type="number"
                step="0.01"
                className="input"
                placeholder="Целева сума"
                value={formData.target_amount}
                onChange={(e) => setFormData({ ...formData, target_amount: e.target.value })}
                required
              />
              <input
                type="date"
                className="input"
                placeholder="Целева дата"
                value={formData.target_date}
                onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
              />
              <div className="form-actions">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-ghost">
                  Отказ
                </button>
                <button type="submit" className="btn btn-primary">
                  Запази
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
        {goals.length > 0 ? (
          goals.map((goal) => (
            <div key={goal.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, flex: 1 }}>{goal.title}</h3>
                <button
                  type="button"
                  onClick={() => handleDelete(goal.id)}
                  className="btn btn-ghost"
                  style={{ padding: '0.25rem', minWidth: 'auto', fontSize: '1.25rem', color: 'var(--text-muted)' }}
                  aria-label="Изтрий"
                >
                  ×
                </button>
              </div>
              {goal.description && (
                <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>{goal.description}</p>
              )}
              <div style={{ marginBottom: '1rem' }}>
                <div
                  style={{
                    height: 6,
                    background: 'var(--bg-muted)',
                    borderRadius: 3,
                    overflow: 'hidden',
                    marginBottom: '0.5rem'
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, goal.progress)}%`,
                      background: goal.is_achieved ? 'var(--income)' : 'var(--primary)',
                      borderRadius: 3,
                      transition: 'width 0.2s'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  <span>
                    {parseFloat(goal.current_amount).toFixed(2)} / {parseFloat(goal.target_amount).toFixed(2)} €
                  </span>
                  <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{Number(goal.progress).toFixed(1)}%</span>
                </div>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                <span style={{ textTransform: 'capitalize' }}>{goal.goal_type}</span>
                {goal.target_date && (
                  <span style={{ display: 'block', marginTop: '0.25rem' }}>
                    До: {new Date(goal.target_date).toLocaleDateString('bg-BG')}
                    {goal.days_remaining != null && (
                      <span> ({goal.days_remaining > 0 ? `${goal.days_remaining} дни` : 'Изтекла'})</span>
                    )}
                  </span>
                )}
              </div>
              {!goal.is_achieved && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="number"
                    step="0.01"
                    className="input"
                    placeholder="Добави сума"
                    id={`amount-${goal.id}`}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.getElementById(`amount-${goal.id}`);
                      if (input?.value) {
                        handleAddAmount(goal.id, input.value);
                        input.value = '';
                      }
                    }}
                    className="btn btn-primary"
                  >
                    Добави
                  </button>
                </div>
              )}
              {goal.is_achieved && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '0.5rem',
                    background: 'var(--income-bg)',
                    color: 'var(--income)',
                    borderRadius: 'var(--radius)',
                    fontWeight: 600,
                    fontSize: '0.9rem'
                  }}
                >
                  ✓ Постигната
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
            Няма цели
          </div>
        )}
      </div>
    </div>
  );
};

export default Goals;
