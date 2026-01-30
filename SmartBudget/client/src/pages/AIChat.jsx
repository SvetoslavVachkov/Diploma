import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';

const AIChat = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [pendingActionData, setPendingActionData] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const response = await api.post('/financial/ai/chat', {
        message: userMessage,
        previousAction: pendingAction,
        previousActionData: pendingActionData
      });

      if (response.data.status === 'success') {
        const aiResponse = response.data.data.response;
        setMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);

        if (response.data.data.action) {
          if (response.data.data.requiresConfirmation) {
            setPendingAction(response.data.data.action);
            setPendingActionData(response.data.data.actionData);
          } else {
            setPendingAction(null);
            setPendingActionData(null);
            if (['create', 'delete_all', 'delete_specific', 'create_goal', 'delete_goal'].includes(response.data.data.action)) {
              setTimeout(() => {
                setMessages(prev => [...prev, { role: 'assistant', content: 'Контекстът е обновен. Можете да питате за актуални данни.' }]);
              }, 500);
            }
          }
        } else {
          setPendingAction(null);
          setPendingActionData(null);
        }
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `Грешка: ${response.data.message || 'Неизвестна грешка'}` }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Грешка: ${error.response?.data?.message || error.message || 'Грешка при изпращане на съобщение'}`
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 12rem)' }}>
      <h1 className="page-title" style={{ marginBottom: '1rem' }}>AI Чат</h1>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow)',
          border: '1px solid var(--border)',
          overflow: 'hidden'
        }}
      >
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {messages.length === 0 && (
            <div style={{ padding: '1.5rem', background: 'var(--primary-light)', borderRadius: 'var(--radius)', borderLeft: '4px solid var(--primary)' }}>
              <p style={{ marginBottom: '0.75rem', fontWeight: 500, color: 'var(--text)' }}>
                Здравейте! Аз съм вашият финансов AI асистент. Можете да ме питате:
              </p>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.8 }}>
                <li>Въпроси за вашите финанси (приходи, разходи, категории)</li>
                <li>Да добавя, изтрия или проверя транзакции</li>
                <li>Да управлявам финансови цели</li>
                <li>Съвети за спестяване на пари</li>
              </ul>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                maxWidth: '85%',
                padding: '0.6rem 1rem',
                borderRadius: 'var(--radius-lg)',
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                background: msg.role === 'user' ? 'var(--primary)' : 'var(--bg-muted)',
                color: msg.role === 'user' ? 'white' : 'var(--text)',
                fontSize: '0.95rem',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap'
              }}
            >
              {msg.content}
            </div>
          ))}
          {loading && (
            <div style={{
              maxWidth: '85%',
              padding: '0.6rem 1rem',
              borderRadius: 'var(--radius-lg)',
              alignSelf: 'flex-start',
              background: 'var(--bg-muted)',
              color: 'var(--text-muted)',
              fontSize: '0.95rem'
            }}>
              Мисля…
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <form onSubmit={sendMessage} style={{ display: 'flex', gap: '0.5rem', padding: '1rem', borderTop: '1px solid var(--border)', background: 'var(--bg-muted)' }}>
          <input
            type="text"
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Напишете съобщение…"
            disabled={loading}
            style={{ flex: 1, margin: 0 }}
          />
          <button type="submit" className="btn btn-primary" disabled={loading || !input.trim()}>
            Изпрати
          </button>
        </form>
      </div>
    </div>
  );
};

export default AIChat;
