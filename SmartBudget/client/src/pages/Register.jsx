import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Register = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await register(
      formData.email,
      formData.password,
      formData.firstName,
      formData.lastName
    );

    if (result.success) {
      navigate('/login');
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">SmartBudget</h1>
        <h2 className="auth-subtitle">Регистрация</h2>
        {error && <div className="alert-error">{error}</div>}
        <form onSubmit={handleSubmit} className="form-row">
          <input
            type="text"
            name="firstName"
            className="input"
            placeholder="Име"
            value={formData.firstName}
            onChange={handleChange}
            required
          />
          <input
            type="text"
            name="lastName"
            className="input"
            placeholder="Фамилия"
            value={formData.lastName}
            onChange={handleChange}
            required
          />
          <input
            type="email"
            name="email"
            className="input"
            placeholder="Имейл"
            value={formData.email}
            onChange={handleChange}
            required
          />
          <input
            type="password"
            name="password"
            className="input"
            placeholder="Парола"
            value={formData.password}
            onChange={handleChange}
            required
          />
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Регистриране…' : 'Регистрирай се'}
          </button>
        </form>
        <p className="auth-link">
          Вече имаш акаунт? <Link to="/login">Влез</Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
