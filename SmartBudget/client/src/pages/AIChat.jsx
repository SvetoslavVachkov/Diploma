import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';

const AIChat = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      let messageToSend = userMessage;
      const msgLower = userMessage.toLowerCase().trim();
      if (pendingAction && (msgLower === 'да' || msgLower === 'yes' || msgLower === 'потвърди' || msgLower.includes('потвърждавам') || msgLower === 'ok' || msgLower === 'ок')) {
        if (pendingAction === 'delete_all') {
          messageToSend = 'изтрий всички транзакции да';
        }
      }
      
      const response = await api.post('/financial/ai/chat', {
        message: messageToSend
      });

      if (response.data.status === 'success') {
        const assistantMessage = {
          role: 'assistant',
          content: response.data.data.response
        };
        
        if (response.data.data.action) {
          assistantMessage.action = response.data.data.action;
          assistantMessage.actionData = response.data.data.data;
        }
        
        if (response.data.data.requiresConfirmation) {
          assistantMessage.requiresConfirmation = true;
          assistantMessage.action = response.data.data.action;
          assistantMessage.actionData = response.data.data.actionData;
          setPendingAction(response.data.data.action);
        } else {
          setPendingAction(null);
        }
        
        setMessages(prev => [...prev, assistantMessage]);
        
        if (response.data.data.action && !response.data.data.requiresConfirmation) {
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        }
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Грешка: ' + (response.data.message || 'Неизвестна грешка')
        }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Грешка при изпращане на съобщение: ' + (error.response?.data?.message || error.message)
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>AI Финансов Съветник</h1>
      <div style={styles.chatContainer}>
        <div style={styles.messages}>
          {messages.length === 0 && (
            <div style={styles.welcome}>
              <p>Здравейте! Аз съм вашият AI финансов съветник.</p>
              <p>Можете да ме питате:</p>
              <ul style={styles.examples}>
                <li>Колко доходи имам този месец?</li>
                <li>Колко харча за гориво?</li>
                <li>Как мога да спестя пари?</li>
                <li>Кои са най-големите ми разходи?</li>
                <li>Изтрий всички транзакции</li>
                <li>Добави транзакция 50 € за храна</li>
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
              <div style={{
                ...styles.messageContent,
                ...(msg.role === 'user' ? {
                  background: '#667eea',
                  color: 'white'
                } : {
                  background: '#f3f4f6',
                  color: '#1f2937'
                })
              }}> 
                {msg.content}
                {msg.requiresConfirmation && (
                  <div style={{ marginTop: '10px' }}>
                    <button
                      onClick={async () => {
                        const confirmMessage = 'да';
                        setMessages(prev => [...prev, { role: 'user', content: confirmMessage }]);
                        setLoading(true);
                        
                        try {
                          let messageToSend = confirmMessage;
                          // Просто изпращаме "да" - backend ще разпознае потвърждението от сесията
                          
                          const response = await api.post('/financial/ai/chat', {
                            message: messageToSend
                          });
                          
                          if (response.data.status === 'success') {
                            const assistantMessage = {
                              role: 'assistant',
                              content: response.data.data.response
                            };
                            
                            if (response.data.data.action) {
                              assistantMessage.action = response.data.data.action;
                              assistantMessage.actionData = response.data.data.data;
                            }
                            
                            setMessages(prev => [...prev, assistantMessage]);
                            setPendingAction(null);
                            
                            if (response.data.data.action && !response.data.data.requiresConfirmation) {
                              setTimeout(() => {
                                window.location.reload();
                              }, 2000);
                            }
                          } else {
                            setMessages(prev => [...prev, {
                              role: 'assistant',
                              content: 'Грешка: ' + (response.data.message || 'Неизвестна грешка')
                            }]);
                          }
                        } catch (error) {
                          setMessages(prev => [...prev, {
                            role: 'assistant',
                            content: 'Грешка при изпращане на съобщение: ' + (error.response?.data?.message || error.message)
                          }]);
                        } finally {
                          setLoading(false);
                        }
                      }}
                      style={{
                        padding: '8px 16px',
                        marginRight: '10px',
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      Потвърди
                    </button>
                    <button
                      onClick={() => {
                        setPendingAction(null);
                        setMessages(prev => prev.filter((_, idx) => idx !== prev.length - 1));
                      }}
                      style={{
                        padding: '8px 16px',
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      Отказ
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ ...styles.message, ...styles.assistantMessage }}>
              <div style={styles.messageContent}>Мисля...</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div style={styles.inputContainer}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Напишете вашето питане..."
            style={styles.input}
            rows={2}
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            style={{
              ...styles.sendButton,
              ...(loading || !input.trim() ? styles.sendButtonDisabled : {})
            }}
          >
            Изпрати
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: '20px',
    maxWidth: '900px',
    margin: '0 auto',
    height: 'calc(100vh - 140px)',
    display: 'flex',
    flexDirection: 'column'
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    marginBottom: '20px',
    color: '#1f2937'
  },
  chatContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    overflow: 'hidden'
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  welcome: {
    padding: '20px',
    background: '#f0f9ff',
    borderRadius: '8px',
    color: '#1e40af'
  },
  examples: {
    marginTop: '10px',
    paddingLeft: '20px'
  },
  message: {
    display: 'flex',
    marginBottom: '8px'
  },
  userMessage: {
    justifyContent: 'flex-end'
  },
  assistantMessage: {
    justifyContent: 'flex-start'
  },
  messageContent: {
    maxWidth: '70%',
    padding: '12px 16px',
    borderRadius: '12px',
    wordWrap: 'break-word',
    lineHeight: '1.5'
  },
  inputContainer: {
    display: 'flex',
    gap: '10px',
    padding: '16px',
    borderTop: '1px solid #e5e7eb',
    background: '#f9fafb'
  },
  input: {
    flex: 1,
    padding: '12px',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '14px',
    resize: 'none',
    fontFamily: 'inherit',
    outline: 'none'
  },
  sendButton: {
    padding: '12px 24px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  sendButtonDisabled: {
    background: '#9ca3af',
    cursor: 'not-allowed'
  }
};

export default AIChat;

