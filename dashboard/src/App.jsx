import React, { useState, useEffect, useRef } from 'react';
import { 
  Laptop, Shield, Users, History, Settings, LogOut, Search, Plus, 
  Trash2, Edit, Check, X, Moon, Sun, Lock, Unlock, RefreshCw, AlertTriangle
} from 'lucide-react';
import './App.css';

const API_BASE = 'https://gestaotabletscscjf.gestaohub.com/api';
const WS_URL = 'wss://gestaotabletscscjf.gestaohub.com';

function App() {
  const [token, setToken] = useState(localStorage.getItem('adminToken') || '');
  const [username, setUsername] = useState(localStorage.getItem('adminUser') || '');
  const [passwordInput, setPasswordInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [loginError, setLoginError] = useState('');

  const [activeTab, setActiveTab] = useState('tablets');
  const [tablets, setTablets] = useState([]);
  const [students, setStudents] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [statusLogs, setStatusLogs] = useState([]);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');

  // Modals status
  const [showTabletModal, setShowTabletModal] = useState(false);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Form states
  const [tabletForm, setTabletForm] = useState({ name: '', serialNumber: '' });
  const [studentForm, setStudentForm] = useState({ name: '', enrollmentId: '', className: '', password: '', active: true });
  
  // CSV Import States
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvInput, setCsvInput] = useState('');

  // Notifications (Toasts)
  const [toasts, setToasts] = useState([]);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  const wsRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Connect WebSocket
  useEffect(() => {
    if (!token) return;

    function connectWS() {
      wsRef.current = new WebSocket(WS_URL);
      
      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'tablet_update') {
            setTablets(prev => {
              const idx = prev.findIndex(t => t.id === data.tablet.id);
              if (idx > -1) {
                const updated = [...prev];
                // Notify if tablet becomes offline
                if (prev[idx].status !== 'offline' && data.tablet.status === 'offline') {
                  addToast(`Tablet "${data.tablet.name}" ficou OFFLINE`, 'offline');
                }
                updated[idx] = data.tablet;
                return updated;
              }
              return [...prev, data.tablet];
            });
            // Reload logs & sessions to keep history fresh
            fetchSessions();
            fetchStatusLogs();
          } else if (data.type === 'tablet_delete') {
            setTablets(prev => prev.filter(t => t.id !== parseInt(data.id)));
          }
        } catch (err) {
          console.error(err);
        }
      };

      wsRef.current.onclose = () => {
        console.log('WS disconnected, retrying in 3s...');
        setTimeout(connectWS, 3000);
      };
    }

    connectWS();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [token]);

  // Fetch initial data
  useEffect(() => {
    if (token) {
      fetchTablets();
      fetchStudents();
      fetchSessions();
      fetchStatusLogs();
    }
  }, [token]);

  const addToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const getAuthHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  });

  const fetchTablets = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/tablets`, { headers: getAuthHeaders() });
      if (res.status === 401 || res.status === 403) return handleLogout();
      const data = await res.json();
      setTablets(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchStudents = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/students`, { headers: getAuthHeaders() });
      const data = await res.json();
      setStudents(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSessions = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/history/sessions`, { headers: getAuthHeaders() });
      const data = await res.json();
      setSessions(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchStatusLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/history/status-logs`, { headers: getAuthHeaders() });
      const data = await res.json();
      setStatusLogs(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch(`${API_BASE}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao realizar login');
      }
      setToken(data.token);
      setUsername(data.username);
      localStorage.setItem('adminToken', data.token);
      localStorage.setItem('adminUser', data.username);
      addToast('Acesso concedido com sucesso!');
    } catch (e) {
      setLoginError(e.message);
    }
  };

  const handleLogout = () => {
    setToken('');
    setUsername('');
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
  };

  // Remote Tablet Actions
  const handleRemoteBlock = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/admin/tablets/${id}/block`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (res.ok) addToast('Comando de Bloqueio enviado.');
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoteUnblock = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/admin/tablets/${id}/unblock`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (res.ok) addToast('Comando de Desbloqueio enviado.');
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoteLogout = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/admin/tablets/${id}/logout`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (res.ok) addToast('Comando de encerramento de sessão enviado.');
    } catch (e) {
      console.error(e);
    }
  };

  // Tablets CRUDS
  const handleSaveTablet = async (e) => {
    e.preventDefault();
    try {
      const method = editingItem ? 'PUT' : 'POST';
      const url = editingItem ? `${API_BASE}/admin/tablets/${editingItem.id}` : `${API_BASE}/admin/tablets`;
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(tabletForm)
      });
      if (res.ok) {
        addToast(editingItem ? 'Tablet atualizado' : 'Tablet adicionado');
        setShowTabletModal(false);
        setEditingItem(null);
        setTabletForm({ name: '', serialNumber: '' });
        fetchTablets();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTablet = async (id) => {
    if (!confirm('Deseja realmente remover este tablet?')) return;
    try {
      const res = await fetch(`${API_BASE}/admin/tablets/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        addToast('Tablet removido');
        fetchTablets();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Student CRUDs
  const handleSaveStudent = async (e) => {
    e.preventDefault();
    try {
      const method = editingItem ? 'PUT' : 'POST';
      const url = editingItem ? `${API_BASE}/admin/students/${editingItem.id}` : `${API_BASE}/admin/students`;
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(studentForm)
      });
      if (res.ok) {
        addToast(editingItem ? 'Estudante atualizado' : 'Estudante cadastrado');
        setShowStudentModal(false);
        setEditingItem(null);
        setStudentForm({ name: '', enrollmentId: '', className: '', password: '', active: true });
        fetchStudents();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleImportCSV = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/admin/students/import`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ csvText: csvInput })
      });
      const data = await res.json();
      if (res.ok) {
        addToast(`${data.count} estudantes importados/atualizados com sucesso!`);
        setShowImportModal(false);
        setCsvInput('');
        fetchStudents();
      } else {
        addToast(data.error || 'Erro na importação', 'offline');
      }
    } catch (e) {
      console.error(e);
      addToast('Erro na conexão com o servidor', 'offline');
    }
  };

  const handleDeleteStudent = async (id) => {
    if (!confirm('Deseja deletar este estudante?')) return;
    try {
      const res = await fetch(`${API_BASE}/admin/students/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        addToast('Estudante deletado');
        fetchStudents();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Summary Metrics calculations
  const totalTablets = tablets.length;
  const onlineTablets = tablets.filter(t => t.status === 'online').length;
  const offlineTablets = tablets.filter(t => t.status === 'offline').length;
  const inUseTablets = tablets.filter(t => t.status === 'in_use').length;
  const blockedTablets = tablets.filter(t => t.status === 'blocked').length;

  // Filter tablets
  const filteredTablets = tablets.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          t.serialNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter ? t.status === statusFilter : true;
    return matchesSearch && matchesStatus;
  });

  if (!token) {
    return (
      <div className="login-container">
        <form className="login-card" onSubmit={handleLogin}>
          <div className="sidebar-logo" style={{justifyContent: 'center', marginBottom: '1.5rem'}}>
            <Laptop size={28} />
            <span>Controle de Tablets</span>
          </div>
          <h2 style={{textAlign: 'center', marginBottom: '1.5rem', fontWeight: 600}}>Acesso Administrativo</h2>
          {loginError && <p style={{color: 'var(--status-offline)', fontSize: '0.875rem', marginBottom: '1rem', textAlign: 'center'}}>{loginError}</p>}
          <div className="form-group">
            <label>Usuário</label>
            <input 
              type="text" 
              className="form-control" 
              value={usernameInput} 
              onChange={e => setUsernameInput(e.target.value)} 
              required
            />
          </div>
          <div className="form-group">
            <label>Senha</label>
            <input 
              type="password" 
              className="form-control" 
              value={passwordInput} 
              onChange={e => setPasswordInput(e.target.value)} 
              required
            />
          </div>
          <button type="submit" className="action-btn btn-primary" style={{width: '100%', padding: '0.75rem', marginTop: '1.5rem', fontSize: '0.9rem'}}>
            Entrar no Painel
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Toast containers */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === 'offline' ? <AlertTriangle size={18} color="var(--status-offline)" /> : <Check size={18} color="var(--status-online)" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* Lateral Menu Sidebar */}
      <aside className="sidebar">
        <div>
          <div className="sidebar-logo">
            <Laptop size={24} />
            <span>Controle Tablets</span>
          </div>
          <nav>
            <ul className="menu-list">
              <li>
                <div className={`menu-item ${activeTab === 'tablets' ? 'active' : ''}`} onClick={() => setActiveTab('tablets')}>
                  <Laptop size={18} />
                  <span>Tablets</span>
                </div>
              </li>
              <li>
                <div className={`menu-item ${activeTab === 'students' ? 'active' : ''}`} onClick={() => setActiveTab('students')}>
                  <Users size={18} />
                  <span>Estudantes</span>
                </div>
              </li>
              <li>
                <div className={`menu-item ${activeTab === 'sessions' ? 'active' : ''}`} onClick={() => setActiveTab('sessions')}>
                  <History size={18} />
                  <span>Histórico de Sessões</span>
                </div>
              </li>
              <li>
                <div className={`menu-item ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>
                  <Shield size={18} />
                  <span>Logs do Sistema</span>
                </div>
              </li>
            </ul>
          </nav>
        </div>
        <div>
          <div className="menu-item" style={{marginBottom: '0.5rem'}} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span>{theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</span>
          </div>
          <div className="menu-item" onClick={handleLogout}>
            <LogOut size={18} />
            <span>Sair</span>
          </div>
        </div>
      </aside>

      {/* Main View Area */}
      <main className="main-content">
        <header style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem'}}>
          <div>
            <h1 style={{fontSize: '1.75rem', fontWeight: 700}}>Monitoramento em Tempo Real</h1>
            <p style={{color: 'var(--text-secondary)', fontSize: '0.9rem'}}>Conectado como {username}</p>
          </div>
          <button className="action-btn" onClick={() => { fetchTablets(); fetchSessions(); }} style={{flex: 'initial', padding: '0.6rem 1rem'}}>
            <RefreshCw size={16} />
            <span>Atualizar</span>
          </button>
        </header>

        {/* Status Metrics Cards */}
        <section className="summary-cards">
          <div className="summary-card">
            <div className="card-icon"><Laptop size={24} color="var(--text-primary)" /></div>
            <div className="card-info"><h3>Total Tablets</h3><p>{totalTablets}</p></div>
          </div>
          <div className="summary-card" style={{borderLeft: '4px solid var(--status-online)'}}>
            <div className="card-icon"><Check size={24} color="var(--status-online)" /></div>
            <div className="card-info"><h3>Online</h3><p>{onlineTablets}</p></div>
          </div>
          <div className="summary-card" style={{borderLeft: '4px solid var(--status-in-use)'}}>
            <div className="card-icon"><Laptop size={24} color="var(--status-in-use)" /></div>
            <div className="card-info"><h3>Em Uso</h3><p>{inUseTablets}</p></div>
          </div>
          <div className="summary-card" style={{borderLeft: '4px solid var(--status-blocked)'}}>
            <div className="card-icon"><Lock size={24} color="var(--status-blocked)" /></div>
            <div className="card-info"><h3>Bloqueados</h3><p>{blockedTablets}</p></div>
          </div>
          <div className="summary-card" style={{borderLeft: '4px solid var(--status-offline)'}}>
            <div className="card-icon"><X size={24} color="var(--status-offline)" /></div>
            <div className="card-info"><h3>Offline</h3><p>{offlineTablets}</p></div>
          </div>
        </section>

        {/* TABULAR OR GRID DATA */}
        {activeTab === 'tablets' && (
          <div className="animate-fade-in">
            <div className="controls-bar">
              <div className="filters-group">
                <input 
                  type="text" 
                  placeholder="Pesquisar serial ou nome..." 
                  className="search-input"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option value="">Todos Status</option>
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                  <option value="in_use">Em Uso</option>
                  <option value="blocked">Bloqueado</option>
                </select>
              </div>
              <button className="action-btn btn-primary" onClick={() => { setEditingItem(null); setTabletForm({name:'', serialNumber:''}); setShowTabletModal(true); }}>
                <Plus size={18} />
                <span>Adicionar Tablet</span>
              </button>
            </div>

            <div className="tablet-grid">
              {filteredTablets.map(tablet => {
                const isOnline = tablet.status === 'online';
                const isInUse = tablet.status === 'in_use';
                const isBlocked = tablet.status === 'blocked';
                const isOffline = tablet.status === 'offline';
                
                let badgeColor = 'var(--status-offline)';
                if (isOnline) badgeColor = 'var(--status-online)';
                if (isInUse) badgeColor = 'var(--status-in-use)';
                if (isBlocked) badgeColor = 'var(--status-blocked)';

                const student = students.find(s => s.id === tablet.currentStudentId);

                return (
                  <div key={tablet.id} className="tablet-card">
                    <div>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem'}}>
                        <h3 style={{fontWeight: 600, fontSize: '1.05rem'}}>{tablet.name}</h3>
                        <span className="tablet-status-badge" style={{backgroundColor: `${badgeColor}15`, color: badgeColor}}>
                          <span className="pulse-dot" style={{backgroundColor: badgeColor}}></span>
                          {tablet.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p style={{fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem'}}>S/N: {tablet.serialNumber}</p>
                      
                      {isInUse && student ? (
                        <div style={{marginTop: '0.75rem', padding: '0.5rem', borderRadius: '6px', backgroundColor: 'var(--bg-primary)', fontSize: '0.85rem'}}>
                          <p style={{fontWeight: 500, color: 'var(--accent-color)'}}>Estudante Logado:</p>
                          <p style={{fontWeight: 600}}>{student.name} ({student.className})</p>
                        </div>
                      ) : (
                        <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.75rem'}}>Nenhum estudante ativo</p>
                      )}
                    </div>

                    <div>
                      <p style={{fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.75rem'}}>
                        Visto por último: {tablet.lastSeen ? new Date(tablet.lastSeen).toLocaleTimeString() : 'Nunca'}
                      </p>
                      <div className="actions-row">
                        {isBlocked ? (
                          <button className="action-btn" onClick={() => handleRemoteUnblock(tablet.id)}>
                            <Unlock size={14} />
                            <span>Desbloquear</span>
                          </button>
                        ) : (
                          <button className="action-btn" onClick={() => handleRemoteBlock(tablet.id)}>
                            <Lock size={14} />
                            <span>Bloquear</span>
                          </button>
                        )}
                        {isInUse && (
                          <button className="action-btn" onClick={() => handleRemoteLogout(tablet.id)}>
                            <LogOut size={14} />
                            <span>Logout Remoto</span>
                          </button>
                        )}
                      </div>
                      <div className="actions-row" style={{marginTop: '0.5rem'}}>
                        <button className="action-btn" onClick={() => { setEditingItem(tablet); setTabletForm({name: tablet.name, serialNumber: tablet.serialNumber}); setShowTabletModal(true); }}>
                          <Edit size={12} />
                        </button>
                        <button className="action-btn" style={{borderColor: 'var(--status-offline)'}} onClick={() => handleDeleteTablet(tablet.id)}>
                          <Trash2 size={12} color="var(--status-offline)" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'students' && (
          <div className="animate-fade-in">
            <div className="controls-bar">
              <input 
                type="text" 
                placeholder="Buscar estudante..." 
                className="search-input"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <div style={{display: 'flex', gap: '0.75rem'}}>
                <button className="action-btn" onClick={() => setShowImportModal(true)}>
                  <Plus size={18} />
                  <span>Importar CSV</span>
                </button>
                <button className="action-btn btn-primary" onClick={() => { setEditingItem(null); setStudentForm({name: '', enrollmentId: '', className: '', password: '', active: true}); setShowStudentModal(true); }}>
                  <Plus size={18} />
                  <span>Cadastrar Estudante</span>
                </button>
              </div>
            </div>

            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Matrícula</th>
                    <th>Nome</th>
                    <th>Turma</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {students.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.enrollmentId.includes(searchQuery)).map(student => (
                    <tr key={student.id}>
                      <td style={{fontWeight: 600}}>{student.enrollmentId}</td>
                      <td>{student.name}</td>
                      <td>{student.className}</td>
                      <td>
                        <span className="tablet-status-badge" style={{
                          backgroundColor: student.active ? 'var(--status-online)15' : 'var(--status-offline)15',
                          color: student.active ? 'var(--status-online)' : 'var(--status-offline)'
                        }}>
                          {student.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td>
                        <div style={{display: 'flex', gap: '0.5rem'}}>
                          <button className="action-btn" style={{flex: 'initial'}} onClick={() => { setEditingItem(student); setStudentForm({name: student.name, enrollmentId: student.enrollmentId, className: student.className, active: student.active}); setShowStudentModal(true); }}>
                            <Edit size={14} />
                          </button>
                          <button className="action-btn" style={{flex: 'initial', borderColor: 'var(--status-offline)'}} onClick={() => handleDeleteStudent(student.id)}>
                            <Trash2 size={14} color="var(--status-offline)" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'sessions' && (
          <div className="animate-fade-in">
            <h2 style={{fontSize: '1.25rem', marginBottom: '1rem', fontWeight: 600}}>Histórico Recente de Utilização</h2>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tablet</th>
                    <th>Estudante</th>
                    <th>Login</th>
                    <th>Logout</th>
                    <th>Tempo de Uso</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map(s => (
                    <tr key={s.id}>
                      <td>{s.tabletName}</td>
                      <td style={{fontWeight: 600}}>{s.studentName}</td>
                      <td>{new Date(s.loginTime).toLocaleString()}</td>
                      <td>{s.logoutTime ? new Date(s.logoutTime).toLocaleString() : <span style={{color: 'var(--status-online)', fontWeight: 600}}>Ativo agora</span>}</td>
                      <td>
                        {s.logoutTime 
                          ? `${Math.floor(s.durationSeconds / 60)}m ${s.durationSeconds % 60}s`
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="animate-fade-in">
            <h2 style={{fontSize: '1.25rem', marginBottom: '1rem', fontWeight: 600}}>Logs de Comunicação dos Tablets</h2>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Horário</th>
                    <th>Tablet</th>
                    <th>Status Informado</th>
                    <th>Ocorrência / Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {statusLogs.map(log => (
                    <tr key={log.id}>
                      <td style={{color: 'var(--text-secondary)'}}>{new Date(log.timestamp).toLocaleString()}</td>
                      <td>{log.tabletName}</td>
                      <td>
                        <span className="tablet-status-badge" style={{
                          backgroundColor: 'var(--bg-primary)',
                          color: log.status === 'offline' ? 'var(--status-offline)' : 'var(--text-primary)'
                        }}>
                          {log.status}
                        </span>
                      </td>
                      <td>{log.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* TABLET MODAL FORM */}
      {showTabletModal && (
        <div className="modal-overlay">
          <form className="modal animate-fade-in" onSubmit={handleSaveTablet}>
            <h3 className="modal-header">{editingItem ? 'Editar Tablet' : 'Adicionar Novo Tablet'}</h3>
            <div className="form-group">
              <label>Identificação / Nome</label>
              <input 
                type="text" 
                className="form-control" 
                value={tabletForm.name} 
                onChange={e => setTabletForm({...tabletForm, name: e.target.value})} 
                placeholder="Ex: Tablet Sala 01"
                required
              />
            </div>
            <div className="form-group">
              <label>Número de Série (Identificador Único)</label>
              <input 
                type="text" 
                className="form-control" 
                value={tabletForm.serialNumber} 
                onChange={e => setTabletForm({...tabletForm, serialNumber: e.target.value})} 
                placeholder="Ex: SN123456789"
                required
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="action-btn" onClick={() => setShowTabletModal(false)}>Cancelar</button>
              <button type="submit" className="action-btn btn-primary">Salvar</button>
            </div>
          </form>
        </div>
      )}

      {/* STUDENT MODAL FORM */}
      {showStudentModal && (
        <div className="modal-overlay">
          <form className="modal animate-fade-in" onSubmit={handleSaveStudent}>
            <h3 className="modal-header">{editingItem ? 'Editar Estudante' : 'Cadastrar Estudante'}</h3>
            <div className="form-group">
              <label>Matrícula / Usuário Institucional</label>
              <input 
                type="text" 
                className="form-control" 
                value={studentForm.enrollmentId} 
                onChange={e => setStudentForm({...studentForm, enrollmentId: e.target.value})} 
                placeholder="Ex: 2026001"
                required
              />
            </div>
            <div className="form-group">
              <label>Nome Completo</label>
              <input 
                type="text" 
                className="form-control" 
                value={studentForm.name} 
                onChange={e => setStudentForm({...studentForm, name: e.target.value})} 
                placeholder="Ex: João Silva"
                required
              />
            </div>
            <div className="form-group">
              <label>Senha de Acesso (Tablet)</label>
              <input 
                type="password" 
                className="form-control" 
                value={studentForm.password} 
                onChange={e => setStudentForm({...studentForm, password: e.target.value})} 
                placeholder={editingItem ? "Deixe em branco para não alterar" : "Ex: 123456"}
                required={!editingItem}
              />
            </div>
            <div className="form-group">
              <label>Turma</label>
              <input 
                type="text" 
                className="form-control" 
                value={studentForm.className} 
                onChange={e => setStudentForm({...studentForm, className: e.target.value})} 
                placeholder="Ex: 1º Ano A"
                required
              />
            </div>
            <div className="form-group" style={{flexDirection: 'row', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem'}}>
              <input 
                type="checkbox" 
                checked={studentForm.active} 
                onChange={e => setStudentForm({...studentForm, active: e.target.checked})} 
                id="activeCheckbox"
              />
              <label htmlFor="activeCheckbox" style={{cursor: 'pointer'}}>Estudante Ativo para Uso</label>
            </div>
            <div className="modal-footer">
              <button type="button" className="action-btn" onClick={() => setShowStudentModal(false)}>Cancelar</button>
              <button type="submit" className="action-btn btn-primary">Salvar</button>
            </div>
          </form>
        </div>
      )}

      {/* CSV IMPORT MODAL */}
      {showImportModal && (
        <div className="modal-overlay">
          <form className="modal animate-fade-in" onSubmit={handleImportCSV} style={{maxWidth: '560px'}}>
            <h3 className="modal-header">Importar Estudantes via CSV</h3>
            <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem'}}>
              Cole o conteúdo CSV abaixo. Formato esperado por linha:<br />
              <code>matricula,nome completo,turma,senha</code>
            </p>
            <div className="form-group">
              <textarea 
                className="form-control" 
                rows="10" 
                style={{fontFamily: 'monospace', resize: 'vertical', width: '100%'}}
                value={csvInput} 
                onChange={e => setCsvInput(e.target.value)}
                placeholder="2026005,Lucas Moura,2º Ano B,senha123&#10;2026006,Maria Costa,3º Ano A,senha456"
                required
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="action-btn" onClick={() => setShowImportModal(false)}>Cancelar</button>
              <button type="submit" className="action-btn btn-primary">Processar Importação</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;
