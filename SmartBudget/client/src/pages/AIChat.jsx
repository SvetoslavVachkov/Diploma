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
            if (response.data.data.action === 'create' || response.data.data.action === 'delete_all' || response.data.data.action === 'delete_specific' || response.data.data.action === 'create_goal' || response.data.data.action === 'delete_goal') {
              setTimeout(() => {
                setMessages(prev => [...prev, { 
                  role: 'assistant', 
                  content: 'Контекстът е обновен. Можете да питате за актуални данни.' 
                }]);
              }, 500);
            }
          }
        } else {
          setPendingAction(null);
          setPendingActionData(null);
        }
      } else {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `Грешка: ${response.data.message || 'Неизвестна грешка'}` 
        }]);
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
    <div style={styles.container}>
      <h1 style={styles.title}>AI Чат</h1>
      <div style={styles.chatContainer}>
        <div style={styles.messages}>
          {messages.length === 0 && (
            <div style={styles.welcomeMessage}>
              <p style={styles.welcomeText}>
                Здравейте! Аз съм вашият финансов AI асистент. Можете да ме питате:
              </p>
              <ul style={styles.welcomeList}>
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
                ...styles.message,
                ...(msg.role === 'user' ? styles.userMessage : styles.assistantMessage)
              }}
            >
              <div style={styles.messageContent}>{msg.content}</div>
            </div>
          ))}
          {loading && (
            <div style={{...styles.message, ...styles.assistantMessage}}>
              <div style={styles.messageContent}>Мисля...</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <form onSubmit={sendMessage} style={styles.inputContainer}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Напишете съобщение..."
            style={styles.input}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            style={{
              ...styles.sendButton,
              ...(loading || !input.trim() ? styles.sendButtonDisabled : {})
            }}
          >
            Изпрати
          </button>
        </form>
      </div>
    </div>
  );
};

const styles = {
  container: {
    maxWidth: '900px',
    margin: '0 auto',
    height: 'calc(100vh - 200px)',
    display: 'flex',
    flexDirection: 'column'
  },
  title: {
    fontSize: '36px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '24px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text'
  },
  chatContainer: {
    background: 'white',
    borderRadius: '20px',
    boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
    border: '1px solid rgba(102, 126, 234, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden'
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  welcomeMessage: {
    padding: '32px',
    background: '#f0f9ff',
    borderRadius: '16px',
    border: '1px solid #bae6fd'
  },
  welcomeText: {
    fontSize: '16px',
    color: '#1e40af',
    marginBottom: '16px',
    fontWeight: '500'
  },
  welcomeList: {
    fontSize: '14px',
    color: '#1e3a8a',
    lineHeight: '1.8',
    paddingLeft: '20px'
  },
  message: {
    maxWidth: '75%',
    padding: '12px 16px',
    borderRadius: '16px',
    wordWrap: 'break-word'
  },
  userMessage: {
    alignSelf: 'flex-end',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white'
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    background: '#f3f4f6',
    color: '#1f2937'
  },
  messageContent: {
    fontSize: '15px',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap'
  },
  inputContainer: {
    display: 'flex',
    gap: '12px',
    padding: '20px',
    borderTop: '1px solid #e5e7eb',
    background: '#f9fafb'
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    fontSize: '15px',
    border: '1px solid #d1d5db',
    borderRadius: '12px',
    outline: 'none',
    transition: 'all 0.3s'
  },
  sendButton: {
    padding: '12px 24px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s'
  },
  sendButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  }
};

export default AIChat;

