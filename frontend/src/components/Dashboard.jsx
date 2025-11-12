/**
 * Dashboard Component
 * Main application view after authentication
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, logout, isAuthenticated } from '../auth/oauth';
import { getUserProfile, listResources, getResource, createResource } from '../api/client';

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Attack mode state
  const [attackMode, setAttackMode] = useState(false);
  const [targetTenantId, setTargetTenantId] = useState('');
  const [targetResourceId, setTargetResourceId] = useState('');
  const [attackResult, setAttackResult] = useState(null);

  // Create resource form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newResource, setNewResource] = useState({
    name: '',
    description: '',
    data: '{}',
    is_public: false,
  });

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/');
      return;
    }

    const fetchData = async () => {
      try {
        const userData = getCurrentUser();
        setUser(userData);

        const profileData = await getUserProfile();
        setProfile(profileData);

        const resourcesData = await listResources();
        setResources(resourcesData);

        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch data:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate]);

  const handleLogout = () => {
    logout();
  };

  const handleRefresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const resourcesData = await listResources();
      setResources(resourcesData);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  // VULNERABILITY TESTING: Cross-tenant access
  const testTenantIsolation = async () => {
    setAttackResult(null);
    try {
      const otherTenantId = parseInt(targetTenantId);
      const resourcesData = await listResources(otherTenantId);
      setAttackResult({
        success: true,
        message: `✅ VULNERABILITY CONFIRMED: Successfully accessed ${resourcesData.length} resources from Tenant ${otherTenantId}!`,
        data: resourcesData,
      });
    } catch (err) {
      setAttackResult({
        success: false,
        message: `❌ Access Denied: ${err.message}`,
      });
    }
  };

  // VULNERABILITY TESTING: IDOR
  const testIDOR = async () => {
    setAttackResult(null);
    try {
      const resourceId = parseInt(targetResourceId);
      const resource = await getResource(resourceId);
      setAttackResult({
        success: true,
        message: `✅ IDOR VULNERABILITY CONFIRMED: Successfully accessed resource ${resourceId} from Tenant ${resource.tenant_id}!`,
        data: [resource],
      });
    } catch (err) {
      setAttackResult({
        success: false,
        message: `❌ Access Denied: ${err.message}`,
      });
    }
  };

  const handleCreateResource = async (e) => {
    e.preventDefault();
    try {
      const data = JSON.parse(newResource.data);
      await createResource({
        ...newResource,
        data: data,
      });
      setShowCreateForm(false);
      setNewResource({ name: '', description: '', data: '{}', is_public: false });
      handleRefresh();
    } catch (err) {
      alert(`Failed to create resource: ${err.message}`);
    }
  };

  if (loading) {
    return <div style={styles.loading}>Loading...</div>;
  }

  if (error) {
    return (
      <div style={styles.error}>
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={handleLogout} style={styles.button}>Logout</button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>OAuth Lab Dashboard</h1>
          <p style={styles.subtitle}>
            Logged in as: <strong>{user?.email}</strong> | Tenant ID: <strong>{user?.tenant_id}</strong>
          </p>
        </div>
        <button onClick={handleLogout} style={styles.logoutButton}>
          Logout
        </button>
      </div>

      {/* Main Content */}
      <div style={styles.content}>
        {/* User Profile Card */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>👤 User Profile</h2>
          <div style={styles.profileInfo}>
            <p><strong>Email:</strong> {profile?.email}</p>
            <p><strong>Tenant ID:</strong> {profile?.tenant_id}</p>
            <p><strong>User ID:</strong> {profile?.sub}</p>
          </div>
        </div>

        {/* Resources Card */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h2 style={styles.cardTitle}>📦 My Resources ({resources.length})</h2>
            <div>
              <button onClick={handleRefresh} style={styles.smallButton}>
                Refresh
              </button>
              <button onClick={() => setShowCreateForm(!showCreateForm)} style={styles.smallButton}>
                {showCreateForm ? 'Cancel' : 'Create New'}
              </button>
            </div>
          </div>

          {showCreateForm && (
            <form onSubmit={handleCreateResource} style={styles.form}>
              <input
                type="text"
                placeholder="Resource Name"
                value={newResource.name}
                onChange={(e) => setNewResource({ ...newResource, name: e.target.value })}
                style={styles.input}
                required
              />
              <textarea
                placeholder="Description"
                value={newResource.description}
                onChange={(e) => setNewResource({ ...newResource, description: e.target.value })}
                style={styles.textarea}
              />
              <textarea
                placeholder='Data (JSON format, e.g., {"key": "value"})'
                value={newResource.data}
                onChange={(e) => setNewResource({ ...newResource, data: e.target.value })}
                style={styles.textarea}
                required
              />
              <label style={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={newResource.is_public}
                  onChange={(e) => setNewResource({ ...newResource, is_public: e.target.checked })}
                />
                Public Resource
              </label>
              <button type="submit" style={styles.button}>
                Create Resource
              </button>
            </form>
          )}

          <div style={styles.resourceList}>
            {resources.length === 0 ? (
              <p style={styles.emptyMessage}>No resources found</p>
            ) : (
              resources.map((resource) => (
                <div key={resource.id} style={styles.resourceItem}>
                  <div>
                    <strong>{resource.name}</strong>
                    <p style={styles.resourceDescription}>{resource.description}</p>
                    <p style={styles.resourceMeta}>
                      ID: {resource.id} | Owner: {resource.owner_id} |
                      {resource.is_public ? ' 🌐 Public' : ' 🔒 Private'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Attack Testing Card */}
        <div style={{...styles.card, ...styles.attackCard}}>
          <h2 style={styles.cardTitle}>🔓 Vulnerability Testing</h2>
          <p style={styles.warningText}>
            ⚠️ Test the intentional security vulnerabilities below
          </p>

          <button
            onClick={() => setAttackMode(!attackMode)}
            style={{...styles.button, backgroundColor: attackMode ? '#dc3545' : '#28a745'}}
          >
            {attackMode ? 'Hide Testing Tools' : 'Show Testing Tools'}
          </button>

          {attackMode && (
            <div style={styles.attackTools}>
              {/* Test Tenant Isolation */}
              <div style={styles.attackSection}>
                <h3 style={styles.attackTitle}>Test #1: Tenant Isolation Bypass</h3>
                <p style={styles.attackDescription}>
                  Try to access resources from another tenant by manipulating the tenant_id parameter.
                </p>
                <div style={styles.attackForm}>
                  <input
                    type="number"
                    placeholder="Target Tenant ID (try 1 or 2)"
                    value={targetTenantId}
                    onChange={(e) => setTargetTenantId(e.target.value)}
                    style={styles.input}
                  />
                  <button onClick={testTenantIsolation} style={styles.attackButton}>
                    Test Tenant Isolation
                  </button>
                </div>
              </div>

              {/* Test IDOR */}
              <div style={styles.attackSection}>
                <h3 style={styles.attackTitle}>Test #2: IDOR (Insecure Direct Object Reference)</h3>
                <p style={styles.attackDescription}>
                  Try to access a specific resource by ID, even if it belongs to another tenant.
                  <br />
                  <small>Hint: Resources 1-5 belong to Tenant 1, Resources 6-10 belong to Tenant 2</small>
                </p>
                <div style={styles.attackForm}>
                  <input
                    type="number"
                    placeholder="Target Resource ID (try 1-10)"
                    value={targetResourceId}
                    onChange={(e) => setTargetResourceId(e.target.value)}
                    style={styles.input}
                  />
                  <button onClick={testIDOR} style={styles.attackButton}>
                    Test IDOR
                  </button>
                </div>
              </div>

              {/* Attack Results */}
              {attackResult && (
                <div style={{
                  ...styles.attackResult,
                  backgroundColor: attackResult.success ? '#d4edda' : '#f8d7da',
                  borderColor: attackResult.success ? '#28a745' : '#dc3545',
                }}>
                  <p style={{
                    color: attackResult.success ? '#155724' : '#721c24',
                    fontWeight: 'bold',
                  }}>
                    {attackResult.message}
                  </p>
                  {attackResult.data && (
                    <details style={{marginTop: '10px'}}>
                      <summary style={{cursor: 'pointer'}}>View Data</summary>
                      <pre style={styles.jsonData}>
                        {JSON.stringify(attackResult.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: 'white',
    padding: '20px 40px',
    boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    margin: '0',
    color: '#333',
    fontSize: '24px',
  },
  subtitle: {
    margin: '5px 0 0 0',
    color: '#666',
    fontSize: '14px',
  },
  logoutButton: {
    padding: '10px 20px',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  content: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '40px 20px',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
    padding: '30px',
    marginBottom: '30px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  cardTitle: {
    margin: '0 0 20px 0',
    color: '#333',
    fontSize: '20px',
  },
  profileInfo: {
    color: '#666',
    lineHeight: '1.8',
  },
  resourceList: {
    marginTop: '20px',
  },
  resourceItem: {
    padding: '15px',
    backgroundColor: '#f8f9fa',
    borderRadius: '5px',
    marginBottom: '10px',
    border: '1px solid #dee2e6',
  },
  resourceDescription: {
    margin: '5px 0',
    color: '#666',
    fontSize: '14px',
  },
  resourceMeta: {
    margin: '5px 0 0 0',
    color: '#999',
    fontSize: '12px',
  },
  emptyMessage: {
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '20px',
  },
  button: {
    padding: '10px 20px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '14px',
    marginTop: '10px',
  },
  smallButton: {
    padding: '8px 15px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '12px',
    marginLeft: '10px',
  },
  form: {
    marginBottom: '20px',
    padding: '20px',
    backgroundColor: '#f8f9fa',
    borderRadius: '5px',
  },
  input: {
    width: '100%',
    padding: '10px',
    marginBottom: '10px',
    border: '1px solid #dee2e6',
    borderRadius: '5px',
    fontSize: '14px',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    padding: '10px',
    marginBottom: '10px',
    border: '1px solid #dee2e6',
    borderRadius: '5px',
    fontSize: '14px',
    minHeight: '80px',
    boxSizing: 'border-box',
    fontFamily: 'monospace',
  },
  checkbox: {
    display: 'block',
    marginBottom: '15px',
    color: '#666',
  },
  attackCard: {
    borderLeft: '4px solid #ffc107',
  },
  warningText: {
    color: '#856404',
    backgroundColor: '#fff3cd',
    padding: '10px',
    borderRadius: '5px',
    marginBottom: '15px',
  },
  attackTools: {
    marginTop: '20px',
  },
  attackSection: {
    marginBottom: '30px',
    padding: '20px',
    backgroundColor: '#f8f9fa',
    borderRadius: '5px',
  },
  attackTitle: {
    margin: '0 0 10px 0',
    color: '#333',
    fontSize: '16px',
  },
  attackDescription: {
    color: '#666',
    fontSize: '14px',
    marginBottom: '15px',
    lineHeight: '1.6',
  },
  attackForm: {
    display: 'flex',
    gap: '10px',
  },
  attackButton: {
    padding: '10px 20px',
    backgroundColor: '#ffc107',
    color: '#333',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
  },
  attackResult: {
    marginTop: '20px',
    padding: '15px',
    borderRadius: '5px',
    border: '1px solid',
  },
  jsonData: {
    backgroundColor: '#f8f9fa',
    padding: '10px',
    borderRadius: '5px',
    fontSize: '12px',
    overflow: 'auto',
    maxHeight: '300px',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    fontSize: '18px',
    color: '#666',
  },
  error: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    color: '#dc3545',
  },
};
