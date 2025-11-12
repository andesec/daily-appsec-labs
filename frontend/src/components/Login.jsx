/**
 * Login Component
 */
import React from 'react';
import { initiateLogin } from '../auth/oauth';

export default function Login() {
  const handleLogin = () => {
    initiateLogin();
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>OAuth 2.0 + PKCE Lab</h1>
        <p style={styles.subtitle}>Multi-Tenant SaaS Security Demo</p>

        <div style={styles.content}>
          <p style={styles.description}>
            This is an educational lab demonstrating OAuth 2.0 Authorization Code Flow
            with PKCE in a multi-tenant environment.
          </p>

          <button onClick={handleLogin} style={styles.button}>
            Login with OAuth
          </button>

          <div style={styles.info}>
            <h3>Test Credentials</h3>
            <div style={styles.credentials}>
              <div>
                <strong>Tenant 1 (Acme):</strong>
                <br />
                alice / password123
                <br />
                bob / password123
              </div>
              <div style={{marginTop: '10px'}}>
                <strong>Tenant 2 (Beta):</strong>
                <br />
                charlie / password123
              </div>
            </div>
          </div>

          <div style={styles.warning}>
            ⚠️ This application contains intentional security vulnerabilities for educational purposes.
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    padding: '20px',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    padding: '40px',
    maxWidth: '500px',
    width: '100%',
  },
  title: {
    margin: '0 0 10px 0',
    color: '#333',
    fontSize: '28px',
    textAlign: 'center',
  },
  subtitle: {
    margin: '0 0 30px 0',
    color: '#666',
    fontSize: '16px',
    textAlign: 'center',
  },
  content: {
    marginTop: '20px',
  },
  description: {
    color: '#666',
    lineHeight: '1.6',
    marginBottom: '30px',
  },
  button: {
    width: '100%',
    padding: '15px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background-color 0.3s',
  },
  info: {
    marginTop: '30px',
    padding: '20px',
    backgroundColor: '#f8f9fa',
    borderRadius: '5px',
    fontSize: '14px',
  },
  credentials: {
    marginTop: '10px',
    color: '#495057',
  },
  warning: {
    marginTop: '20px',
    padding: '15px',
    backgroundColor: '#fff3cd',
    border: '1px solid #ffc107',
    borderRadius: '5px',
    fontSize: '14px',
    color: '#856404',
    textAlign: 'center',
  },
};
