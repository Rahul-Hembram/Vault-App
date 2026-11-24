import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowDownToLine, ArrowUpRight, AudioLines, Check, Copy, File, FileArchive, FileImage,
  FileText, Film, Fingerprint, FolderOpen, HardDrive, KeyRound, LayoutDashboard, LockKeyhole,
  LogOut, Menu, Music2, Plus, Search, Settings, Shield, ShieldCheck, Sun, Moon, Trash2, Upload,
  UserRound, X, Eye, EyeOff
} from 'lucide-react';

const API = '/api';
const NAV = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'files', label: 'My files', icon: FolderOpen },
  { id: 'upload', label: 'Upload files', icon: Upload },
  { id: 'activity', label: 'Security logs', icon: Activity },
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'settings', label: 'Settings', icon: Settings }
];

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    credentials: 'include',
    ...options,
    headers: options.body instanceof FormData ? options.headers : {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${response.status}).`);
  }
  return response;
}

const json = (body) => JSON.stringify(body);
const formatBytes = (bytes = 0) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** power)).toFixed(power ? 1 : 0)} ${units[power]}`;
};
const formatDate = (date) => new Date(date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const getKind = (mime, name = '') => {
  if (mime?.startsWith('image/')) return 'image';
  if (mime?.startsWith('audio/')) return 'audio';
  if (mime?.startsWith('video/')) return 'video';
  if (mime === 'application/pdf' || /\.(docx?|txt|rtf|odt)$/i.test(name)) return 'document';
  return 'other';
};
const fileIcon = (file, size = 18) => {
  const kind = getKind(file.mimeType, file.name);
  const Icon = kind === 'image' ? FileImage : kind === 'audio' ? Music2 : kind === 'video' ? Film :
    kind === 'document' ? FileText : File;
  return <Icon size={size} />;
};
const actionLabel = (action) => ({
  file_uploaded: 'File uploaded', file_encrypted: 'File encrypted', file_decrypted: 'File decrypted',
  file_opened: 'File opened', file_downloaded: 'File downloaded', file_copied: 'File copied', file_deleted: 'File deleted',
  authentication_failed: 'Failed verification', account_locked: 'Sensitive operations locked',
  account_created: 'Account created', login: 'Signed in', password_changed: 'Password changed'
}[action] || action.replaceAll('_', ' '));

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [toastError, setToastError] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [menuOpen, setMenuOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [activities, setActivities] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [profileName, setProfileName] = useState('');
  const [settings, setSettings] = useState({ theme: 'dark', notifications: true });
  const [modal, setModal] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);

  const notify = useCallback((message, isError = false) => {
    if (!settings.notifications && !isError) return;
    setToastError(isError);
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  }, [settings.notifications]);

  const loadData = useCallback(async () => {
    const [dashResponse, filesResponse, activityResponse] = await Promise.all([
      request('/dashboard'), request('/files'), request('/activities')
    ]);
    const dash = await dashResponse.json();
    const fileData = await filesResponse.json();
    const activityData = await activityResponse.json();
    setDashboard(dash);
    setFiles(fileData.files);
    setActivities(activityData.activities);
  }, []);

  useEffect(() => {
    request('/auth/me')
      .then(async (response) => {
        const data = await response.json();
        setUser(data.user);
        setProfileName(data.user.name);
        const userSettings = data.user.settings || { theme: 'dark', notifications: true };
        setSettings(userSettings);
        setTheme(userSettings.theme || 'dark');
        await loadData();
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [loadData]);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  const refresh = async () => {
    try { await loadData(); } catch (e) { notify(e.message, true); }
  };

  const filteredFiles = useMemo(() => {
    let result = files.filter((file) => file.name.toLowerCase().includes(search.toLowerCase()));
    if (filter !== 'all') result = result.filter(file => getKind(file.mimeType, file.name) === filter);
    return [...result].sort((a, b) => sort === 'name'
      ? a.name.localeCompare(b.name) : sort === 'oldest'
        ? new Date(a.createdAt) - new Date(b.createdAt)
        : new Date(b.createdAt) - new Date(a.createdAt));
  }, [files, search, filter, sort]);

  async function signIn(mode, values) {
    setBusy(true);
    setError('');
    try {
      const response = await request(`/auth/${mode}`, { method: 'POST', body: json(values) });
      const data = await response.json();
      const meResponse = await request('/auth/me');
      const me = await meResponse.json();
      setUser(me.user);
      setProfileName(me.user.name);
      setSettings(me.user.settings || { theme: 'dark', notifications: true });
      setTheme(me.user.settings?.theme || 'dark');
      await loadData();
      notify(mode === 'register' ? 'Your SecureVault is ready.' : 'Welcome back.');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function signOut() {
    try { await request('/auth/logout', { method: 'POST' }); }
    finally {
      setUser(null);
      setFiles([]);
      setDashboard(null);
      setActivities([]);
      setPage('dashboard');
    }
  }

  async function uploadFiles(list) {
    if (!list?.length) return;
    setUploading(true);
    try {
      for (const file of list) {
        const formData = new FormData();
        formData.append('file', file);
        await request('/files', { method: 'POST', body: formData });
      }
      await refresh();
      notify(`${list.length} file${list.length === 1 ? '' : 's'} uploaded securely.`);
      setPage('files');
    } catch (e) { notify(e.message, true); }
    finally { setUploading(false); }
  }

  function sensitive(file, kind) {
    setModal({ file, kind, password: '', error: '' });
  }

  async function executeSensitive(event) {
    event.preventDefault();
    if (!modal) return;
    setBusy(true);
    setModal({ ...modal, error: '' });
    const current = modal;
    try {
      const options = { method: 'POST', body: json({ password: current.password }) };
      if (current.kind === 'encrypt') {
        await request(`/files/${current.file.id}/encrypt`, options);
        notify('File encrypted with AES-256-GCM.');
      } else if (current.kind === 'copy') {
        await request(`/files/${current.file.id}/copy`, options);
        notify('Protected copy created.');
      } else if (current.kind === 'delete') {
        await request(`/files/${current.file.id}`, { ...options, method: 'DELETE' });
        notify('File permanently deleted.');
      } else {
        const response = await request(`/files/${current.file.id}/content`, {
          ...options, body: json({ password: current.password, mode: current.kind === 'download' ? 'download' : 'preview' })
        });
        const blob = await response.blob();
        if (current.kind === 'download' || !['image', 'audio', 'video', 'document'].includes(getKind(current.file.mimeType, current.file.name))) {
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = current.file.name;
          anchor.click();
          URL.revokeObjectURL(url);
          if (current.kind !== 'download') notify('This file type cannot be previewed, so it was downloaded.');
        } else {
          const url = URL.createObjectURL(blob);
          setPreview({ file: current.file, url, type: current.file.mimeType });
        }
        if (current.kind === 'download') notify('Decrypted download started.');
      }
      setModal(null);
      await refresh();
    } catch (e) {
      setModal({ ...current, error: e.message, password: '' });
    } finally { setBusy(false); }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await request('/profile', { method: 'PUT', body: json({ name: profileName }) });
      const data = await response.json();
      setUser({ ...user, name: data.name });
      notify('Profile updated.');
    } catch (e) { notify(e.message, true); }
    finally { setBusy(false); }
  }

  async function saveSettings(next) {
    const previous = settings;
    setSettings(next);
    setTheme(next.theme);
    try {
      const response = await request('/settings', { method: 'PUT', body: json(next) });
      const data = await response.json();
      setSettings(data.settings);
      notify('Settings saved.');
    } catch (e) {
      setSettings(previous);
      setTheme(previous.theme);
      notify(e.message, true);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    try {
      await request('/profile/password', { method: 'POST', body: json({
        currentPassword: form.get('currentPassword'), newPassword: form.get('newPassword')
      }) });
      formElement.reset();
      notify('Password updated.');
      await refresh();
    } catch (e) { notify(e.message, true); }
    finally { setBusy(false); }
  }

  async function exportLogs() {
    try {
      const response = await request('/activities?format=csv');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'securevault-activity.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) { notify(e.message, true); }
  }

  if (loading) return <div className="loading-screen"><div className="brand-mark"><ShieldCheck /></div><span className="spinner" /> Securing your workspace…</div>;
  if (!user) return <AuthScreen onSubmit={signIn} error={error} busy={busy} />;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="brand"><div className="brand-mark"><ShieldCheck size={21} /></div><span>secure<span className="brand-light">vault</span></span><button className="icon-btn sidebar-close" onClick={() => setMenuOpen(false)}><X size={18} /></button></div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="nav-list">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => { setPage(id); setMenuOpen(false); if (id === 'files') refresh(); }} className={`nav-item ${page === id ? 'active' : ''}`}>
              <Icon size={18} /><span>{label}</span>{id === 'activity' && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="protection-card"><div className="protection-icon"><LockKeyhole size={17} /></div><div><strong>Vault protected</strong><small>AES-256 encryption</small></div><Check size={15} className="green-icon" /></div>
          <div className="sidebar-profile">
            <div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div>
            <div className="profile-ident"><strong>{user.name}</strong><small>{user.email}</small></div>
            <button className="icon-btn" title="Sign out" onClick={signOut}><LogOut size={17} /></button>
          </div>
        </div>
      </aside>
      {menuOpen && <button aria-label="Close navigation" className="mobile-backdrop" onClick={() => setMenuOpen(false)} />}
      <main className="main-area">
        <header className="topbar">
          <button className="icon-btn menu-trigger" onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumb"><span>SecureVault</span><span className="crumb-slash">/</span><strong>{NAV.find(n => n.id === page)?.label}</strong></div>
          <div className="top-actions">
            <div className="secure-status"><span className="status-light" /> All systems secure</div>
            <button className="theme-toggle icon-btn" title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={() => saveSettings({ ...settings, theme: theme === 'dark' ? 'light' : 'dark' })}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="avatar top-avatar" onClick={() => setPage('profile')} title="Your profile">{user.name.slice(0, 1).toUpperCase()}</button>
          </div>
        </header>
        <div className="page-content">
          {page === 'dashboard' && <Dashboard data={dashboard} setPage={setPage} openFile={(file) => sensitive(file, 'open')} />}
          {page === 'files' && <FilesPage files={filteredFiles} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} sort={sort} setSort={setSort} sensitive={sensitive} upload={() => setPage('upload')} />}
          {page === 'upload' && <UploadPage uploading={uploading} inputRef={fileInput} onFiles={uploadFiles} />}
          {page === 'activity' && <ActivityPage activities={activities} exportLogs={exportLogs} />}
          {page === 'profile' && <ProfilePage user={user} name={profileName} setName={setProfileName} onSave={saveProfile} onPasswordChange={changePassword} busy={busy} />}
          {page === 'settings' && <SettingsPage settings={settings} saveSettings={saveSettings} />}
        </div>
        <footer className="footer"><span><Shield size={13} /> Your files are private and encrypted at rest</span><span>SECUREVAULT · PERSONAL WORKSPACE</span></footer>
      </main>
      {toast && <div className={`toast ${toastError ? 'toast-error' : ''}`}><span className="toast-check"><Check size={15} /></span>{toast}</div>}
      {modal && <SensitiveModal modal={modal} setModal={setModal} onSubmit={executeSensitive} busy={busy} />}
      {preview && <PreviewModal preview={preview} onClose={() => { URL.revokeObjectURL(preview.url); setPreview(null); }} />}
    </div>
  );
}

function AuthScreen({ onSubmit, error, busy }) {
  const [mode, setMode] = useState('login');
  const [showPass, setShowPass] = useState(false);
  const [formError, setFormError] = useState('');
  const submit = (event) => {
    event.preventDefault();
    setFormError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (mode === 'register' && values.password !== values.confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }
    delete values.confirmPassword;
    onSubmit(mode, values);
  };
  return (
    <div className="auth-layout">
      <div className="auth-visual">
        <div className="auth-brand"><div className="brand-mark"><ShieldCheck size={21} /></div><span>secure<span className="brand-light">vault</span></span></div>
        <div className="auth-visual-main">
          <div className="eyebrow"><span className="status-light" /> PRIVATE BY DESIGN</div>
          <h1>Your files.<br /><span>Your rules.</span></h1>
          <p>One secure space for everything that matters. Encrypted, organized, and always yours.</p>
          <div className="auth-art"><div className="art-glow" /><div className="art-card art-card-back"><FileText size={22} /><span>personal-notes.pdf</span><LockKeyhole size={15} /></div><div className="art-card art-card-front"><div className="art-shield"><ShieldCheck size={30} /></div><div><strong>AES-256 protected</strong><small>Your files stay yours</small></div><div className="art-pulse" /></div><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /></div>
        </div>
        <div className="auth-foot"><span>END-TO-END PRIVACY</span><span>·</span><span>ZERO COMPROMISE</span></div>
      </div>
      <div className="auth-form-side">
        <div className="auth-form-wrap">
          <div className="form-kicker"><Fingerprint size={16} /> PRIVATE WORKSPACE</div>
          <h2>{mode === 'login' ? 'Welcome back' : 'Create your vault'}</h2>
          <p className="muted">{mode === 'login' ? 'Sign in to access your protected files.' : 'A private home for the files that matter.'}</p>
          <form onSubmit={submit} className="auth-form">
            {mode === 'register' && <label>Full name<input name="name" autoComplete="name" placeholder="Your name" minLength="2" maxLength="80" required /></label>}
            <label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label>
            <label>Password<div className="password-field"><input name="password" type={showPass ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="At least 10 characters" minLength="10" maxLength="72" required /><button type="button" className="icon-btn" onClick={() => setShowPass(!showPass)}>{showPass ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
            {mode === 'register' && <label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" placeholder="Re-enter your password" required /></label>}
            {(error || formError) && <div className="inline-error">{formError || error}</div>}
            <button className="primary-btn auth-submit" disabled={busy}>{busy ? <><span className="spinner small" /> Please wait…</> : <>{mode === 'login' ? 'Sign in securely' : 'Create secure account'} <ArrowUpRight size={17} /></>}</button>
          </form>
          <p className="auth-switch">{mode === 'login' ? 'New to SecureVault?' : 'Already have a vault?'} <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setFormError(''); }}> {mode === 'login' ? 'Create account' : 'Sign in'}</button></p>
          <div className="auth-security"><LockKeyhole size={14} /> Passwords are protected with bcrypt hashing.</div>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ data, setPage, openFile }) {
  const [recentTab, setRecentTab] = useState('recent');
  const stats = data?.stats || { totalFiles: 0, encryptedFiles: 0, storageUsed: 0, typeCounts: {} };
  const protection = stats.totalFiles ? Math.round((stats.encryptedFiles / stats.totalFiles) * 100) : 0;
  const recentItems = recentTab === 'opened' ? data?.recentlyOpened || [] : data?.recentFiles || [];
  return (
    <>
      <div className="page-heading heading-row"><div><div className="overline">YOUR PRIVATE SPACE</div><h1>Good to see you.</h1><p>Here’s what’s happening inside your vault.</p></div><button className="primary-btn" onClick={() => setPage('upload')}><Plus size={17} /> Add files</button></div>
      <section className="stats-grid">
        <StatCard label="Total files" value={stats.totalFiles} note="Across your workspace" icon={<FolderOpen />} accent="violet" />
        <StatCard label="Encrypted files" value={stats.encryptedFiles} note={`${protection}% of your files protected`} icon={<LockKeyhole />} accent="mint" />
        <StatCard label="Storage used" value={formatBytes(stats.storageUsed)} note="Encrypted files count at original size" icon={<HardDrive />} accent="blue" />
        <div className="stat-card protection-stat"><div className="stat-top"><span>VAULT HEALTH</span><ShieldCheck size={17} /></div><div className="health-number">{protection}<small>%</small></div><div className="health-track"><span style={{ width: `${protection}%` }} /></div><div className="stat-note">{stats.totalFiles ? `${stats.encryptedFiles} of ${stats.totalFiles} files encrypted` : 'Encrypt files to strengthen your vault'}</div></div>
      </section>
      <section className="dashboard-grid">
        <div className="panel recent-panel"><div className="section-title"><div><h2>{recentTab === 'opened' ? 'Recently opened' : 'Recent files'}</h2><p>{recentTab === 'opened' ? 'Files you opened most recently' : 'Your latest additions to the vault'}</p></div><div className="recent-controls"><button className={`recent-tab ${recentTab === 'recent' ? 'selected' : ''}`} onClick={() => setRecentTab('recent')}>Added</button><button className={`recent-tab ${recentTab === 'opened' ? 'selected' : ''}`} onClick={() => setRecentTab('opened')}>Opened</button><button className="text-button" onClick={() => setPage('files')}>View all <ArrowUpRight size={15} /></button></div></div>
          {recentItems.length ? <div className="recent-list">{recentItems.map(file => <div className="recent-row" key={file.id}><div className={`file-icon ${getKind(file.mimeType, file.name)}`}>{fileIcon(file)}</div><button className="file-title" onClick={() => openFile(file)}><strong>{file.name}</strong><small>{formatBytes(file.size)} · {formatDate(file.createdAt)}</small></button>{file.encrypted ? <span className="encrypted-pill"><LockKeyhole size={12} /> Encrypted</span> : <span className="plain-pill">Unencrypted</span>}<button className="icon-btn" title="Open file" onClick={() => openFile(file)}><ArrowUpRight size={17} /></button></div>)}</div> : <EmptyState icon={<FolderOpen />} title={recentTab === 'opened' ? 'No recently opened files' : 'Your vault is ready'} copy={recentTab === 'opened' ? 'Open a file and it will appear here.' : 'Upload your first file to get started.'} action={recentTab === 'recent' ? 'Upload a file' : undefined} onClick={() => setPage('upload')} />}
        </div>
        <div className="panel security-panel"><div className="section-title"><div><h2>Vault activity</h2><p>Recent security events</p></div><button className="icon-btn" onClick={() => setPage('activity')} title="See all activity"><ArrowUpRight size={17} /></button></div>
          {data?.activities?.length ? <div className="activity-mini">{data.activities.slice(0, 5).map((activity, i) => <div className="activity-row" key={activity.id}><div className={`activity-icon activity-${activity.action}`}><Activity size={14} /></div><div><strong>{actionLabel(activity.action)}</strong><small>{activity.details}</small></div><span className="activity-time">{new Date(activity.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>)}</div> : <EmptyState icon={<Activity />} title="No activity yet" copy="Security events will appear here." />}
        </div>
      </section>
      <section className="bottom-grid"><div className="panel type-panel"><div className="section-title"><div><h2>File types</h2><p>How your storage is organized</p></div></div><TypeStats counts={stats.typeCounts || {}} total={stats.totalFiles} /></div>
        <div className="secure-banner"><div className="banner-shield"><ShieldCheck size={23} /></div><div><span>YOUR PRIVACY IS ACTIVE</span><h3>Protection that stays out of your way.</h3><p>Encrypted files are protected with AES-256-GCM. Sensitive actions require your password.</p></div><ArrowUpRight size={19} className="banner-arrow" /></div>
      </section>
    </>
  );
}

function StatCard({ label, value, note, icon, accent }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><div className={`stat-icon ${accent}`}>{icon}</div></div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>;
}

function TypeStats({ counts, total }) {
  const entries = [
    { key: 'document', label: 'Documents', icon: <FileText size={15} />, color: 'var(--violet)' },
    { key: 'image', label: 'Images', icon: <FileImage size={15} />, color: 'var(--blue)' },
    { key: 'audio', label: 'Audio', icon: <AudioLines size={15} />, color: 'var(--mint)' },
    { key: 'video', label: 'Video', icon: <Film size={15} />, color: 'var(--orange)' },
    { key: 'other', label: 'Other', icon: <FileArchive size={15} />, color: 'var(--pink)' }
  ];
  return <div className="type-stats">{entries.map(item => <div className="type-row" key={item.key}><span className="type-icon" style={{ color: item.color }}>{item.icon}</span><span className="type-label">{item.label}</span><div className="type-bar"><span style={{ width: `${total ? (counts[item.key] || 0) / total * 100 : 0}%`, background: item.color }} /></div><strong>{counts[item.key] || 0}</strong></div>)}</div>;
}

function FilesPage({ files, search, setSearch, filter, setFilter, sort, setSort, sensitive, upload }) {
  const filters = ['all', 'document', 'image', 'audio', 'video', 'other'];
  return <>
    <div className="page-heading heading-row"><div><div className="overline">YOUR LIBRARY</div><h1>My files</h1><p>Manage, protect, and access your files.</p></div><button className="primary-btn" onClick={upload}><Plus size={17} /> Upload file</button></div>
    <div className="panel files-panel">
      <div className="file-toolbar"><div className="searchbox"><Search size={16} /><input placeholder="Search files…" value={search} onChange={e => setSearch(e.target.value)} /><kbd>⌘ K</kbd></div><div className="toolbar-right"><select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort files"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option></select></div></div>
      <div className="filter-row">{filters.map(item => <button key={item} onClick={() => setFilter(item)} className={`filter-chip ${filter === item ? 'selected' : ''}`}>{item === 'all' ? 'All files' : `${item[0].toUpperCase()}${item.slice(1)}s`}</button>)}</div>
      <div className="file-table-head"><span>FILE NAME</span><span>PROTECTION</span><span>FILE SIZE</span><span>DATE ADDED</span><span>OPERATIONS</span></div>
      {files.length ? <div className="file-table">{files.map(file => <FileRow key={file.id} file={file} sensitive={sensitive} />)}</div> : <div className="empty-files"><EmptyState icon={<Search />} title="No files found" copy="Try a different search or upload a file to begin." /></div>}
    </div>
    <p className="results-note">Showing {files.length} file{files.length === 1 ? '' : 's'} · Files are private to your account</p>
  </>;
}

function FileRow({ file, sensitive }) {
  return <div className="file-row">
    <div className="file-name-cell"><div className={`file-icon ${getKind(file.mimeType, file.name)}`}>{fileIcon(file)}</div><div className="truncate"><strong title={file.name}>{file.name}</strong><small>{file.mimeType || 'Unknown format'}</small></div></div>
    <div>{file.encrypted ? <span className="encrypted-pill"><LockKeyhole size={12} /> Encrypted</span> : <span className="plain-pill">Not encrypted</span>}</div>
    <span className="table-meta">{formatBytes(file.size)}</span><span className="table-meta">{formatDate(file.createdAt)}</span>
    <div className="row-actions">
      <button className="row-action" title="Open preview" onClick={() => sensitive(file, 'open')}><Eye size={15} /></button>
      <button className="row-action" title="Download decrypted file" onClick={() => sensitive(file, 'download')}><ArrowDownToLine size={15} /></button>
      <button className="row-action" title="Create protected copy" onClick={() => sensitive(file, 'copy')}><Copy size={15} /></button>
      {!file.encrypted && <button className="row-action encrypt-action" title="Encrypt file" onClick={() => sensitive(file, 'encrypt')}><LockKeyhole size={15} /></button>}
      <button className="row-action delete-action" title="Delete file" onClick={() => sensitive(file, 'delete')}><Trash2 size={15} /></button>
    </div>
  </div>;
}

function UploadPage({ uploading, inputRef, onFiles }) {
  const [dragging, setDragging] = useState(false);
  return <>
    <div className="page-heading"><div><div className="overline">ADD TO YOUR VAULT</div><h1>Upload files</h1><p>Files are stored privately and can be encrypted with your password.</p></div></div>
    <div className={`upload-zone ${dragging ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); onFiles(e.dataTransfer.files); }}>
      <input ref={inputRef} type="file" multiple hidden onChange={e => { onFiles(e.target.files); e.target.value = ''; }} />
      <div className="upload-illustration"><Upload size={24} /></div><h2>{dragging ? 'Drop to add to your vault' : 'Drag files here to upload'}</h2><p>or browse from your computer</p>
      <button className="primary-btn" disabled={uploading} onClick={() => inputRef.current?.click()}>{uploading ? <><span className="spinner small" /> Uploading…</> : <><FolderOpen size={16} /> Choose files</>}</button>
      <div className="upload-limit"><ShieldCheck size={14} /> Private upload <span>·</span> Up to 100 MB per file</div>
    </div>
    <div className="upload-info-grid"><div className="panel upload-info"><div className="info-icon"><LockKeyhole size={17} /></div><div><strong>Encrypt after upload</strong><p>Use the lock action in My files to encrypt files at rest using AES-256-GCM.</p></div></div><div className="panel upload-info"><div className="info-icon blue"><Fingerprint size={17} /></div><div><strong>Verify it’s you</strong><p>Your password is required before encryption, previews, copies, downloads, and deletion.</p></div></div></div>
  </>;
}

function ActivityPage({ activities, exportLogs }) {
  return <>
    <div className="page-heading heading-row"><div><div className="overline">AUDIT TRAIL</div><h1>Security logs</h1><p>A transparent history of activity in your vault.</p></div><button className="secondary-btn" onClick={exportLogs}><ArrowDownToLine size={16} /> Export CSV</button></div>
    <div className="panel logs-panel"><div className="logs-header"><div><h2>Activity history</h2><p>Latest 500 security events, newest first</p></div><span className="log-count"><span className="status-light" /> {activities.length} EVENTS</span></div>
      {activities.length ? <div className="logs-list">{activities.map(activity => <div className="log-row" key={activity.id}><div className={`log-symbol ${activity.action === 'account_locked' ? 'locked' : activity.action === 'authentication_failed' ? 'failed' : ''}`}><Activity size={16} /></div><div className="log-description"><strong>{actionLabel(activity.action)}</strong><p>{activity.details}</p></div><time>{formatDate(activity.createdAt)}</time></div>)}</div> : <EmptyState icon={<Activity />} title="Nothing to report" copy="Activity will appear here as you use your vault." />}
    </div>
  </>;
}

function ProfilePage({ user, name, setName, onSave, onPasswordChange, busy }) {
  return <>
    <div className="page-heading"><div><div className="overline">ACCOUNT</div><h1>Your profile</h1><p>Manage your account identity and credentials.</p></div></div>
    <div className="profile-grid">
      <section className="panel form-panel"><div className="panel-heading"><div className="avatar profile-large">{user.name.slice(0, 1).toUpperCase()}</div><div><h2>Personal details</h2><p>Update how you appear in SecureVault.</p></div></div>
        <form className="settings-form" onSubmit={onSave}><label>Full name<input value={name} onChange={e => setName(e.target.value)} minLength="2" maxLength="80" required /></label><label>Email address<input value={user.email} disabled /><small>Email address cannot be changed here.</small></label><label>Member since<input value={new Date(user.createdAt).toLocaleDateString()} disabled /></label><button className="primary-btn" disabled={busy}>Save profile</button></form>
      </section>
      <section className="panel form-panel"><div className="panel-heading"><div className="info-icon"><KeyRound size={18} /></div><div><h2>Change password</h2><p>Choose a strong password of at least 10 characters.</p></div></div>
        <form className="settings-form" onSubmit={onPasswordChange}><label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required /></label><label>New password<input name="newPassword" type="password" minLength="10" maxLength="72" autoComplete="new-password" required /></label><button className="secondary-btn" disabled={busy}>Update password</button></form>
        <div className="password-note"><ShieldCheck size={15} /> Passwords are one-way hashed with bcrypt.</div>
      </section>
    </div>
  </>;
}

function SettingsPage({ settings, saveSettings }) {
  return <>
    <div className="page-heading"><div><div className="overline">PREFERENCES</div><h1>Settings</h1><p>Personalize how SecureVault works for you.</p></div></div>
    <div className="settings-grid">
      <section className="panel preferences-panel"><div className="section-title"><div><h2>Appearance</h2><p>Choose your workspace theme.</p></div></div><div className="theme-options">
        {['dark', 'light'].map(value => <button key={value} className={`theme-option ${settings.theme === value ? 'chosen' : ''}`} onClick={() => saveSettings({ ...settings, theme: value })}><div className={`theme-preview ${value}`}><span /><span /><span /></div><div><strong>{value === 'dark' ? 'Midnight' : 'Daylight'}</strong><small>{value === 'dark' ? 'Easy on the eyes' : 'Bright & clear'}</small></div>{settings.theme === value && <Check size={16} />}</button>)}
      </div></section>
      <section className="panel preferences-panel"><div className="section-title"><div><h2>Notifications</h2><p>Control in-app security notifications.</p></div></div><div className="toggle-row"><div><strong>Security notifications</strong><small>Show a confirmation for completed actions and security events.</small></div><button className={`toggle ${settings.notifications ? 'on' : ''}`} aria-label="Toggle notifications" aria-pressed={settings.notifications} onClick={() => saveSettings({ ...settings, notifications: !settings.notifications })}><span /></button></div></section>
      <section className="panel preferences-panel security-settings"><div className="section-title"><div><h2>Security</h2><p>How your protected operations are safeguarded.</p></div></div><div className="security-setting-row"><div className="info-icon"><LockKeyhole size={16} /></div><div><strong>Operation verification</strong><small>Verify your account password before sensitive actions.</small></div><span className="enabled-pill"><Check size={12} /> ACTIVE</span></div><div className="security-setting-row"><div className="info-icon blue"><ShieldCheck size={16} /></div><div><strong>Failed attempt lockout</strong><small>Three failures lock protected actions temporarily.</small></div><span className="enabled-pill"><Check size={12} /> ACTIVE</span></div></section>
    </div>
  </>;
}

function SensitiveModal({ modal, setModal, onSubmit, busy }) {
  const meta = {
    encrypt: { title: 'Encrypt this file', action: 'Encrypt file', icon: <LockKeyhole />, description: 'The file will be encrypted at rest using AES-256-GCM.' },
    open: { title: 'Open protected file', action: 'Open file', icon: <Eye />, description: 'Your password is required to decrypt this file for preview.' },
    download: { title: 'Download file', action: 'Decrypt & download', icon: <ArrowDownToLine />, description: 'A decrypted copy will be sent to your browser. The stored file remains encrypted.' },
    copy: { title: 'Create a copy', action: 'Create protected copy', icon: <Copy />, description: 'The copy will retain the original protection status.' },
    delete: { title: 'Delete this file?', action: 'Delete permanently', icon: <Trash2 />, description: 'This permanently removes the file from your vault. This cannot be undone.' }
  }[modal.kind];
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><div className="modal-card">
    <button className="icon-btn modal-close" onClick={() => setModal(null)}><X size={18} /></button><div className={`modal-icon ${modal.kind === 'delete' ? 'danger' : ''}`}>{meta.icon}</div>
    <h2>{meta.title}</h2><p className="modal-file-name">{modal.file.name}</p><p className="modal-description">{meta.description}</p>
    <form onSubmit={onSubmit}><label className="modal-password-label">Confirm your password<input autoFocus type="password" value={modal.password} onChange={e => setModal({ ...modal, password: e.target.value, error: '' })} required /></label>
      {modal.error && <div className="inline-error">{modal.error}</div>}
      <div className="modal-actions"><button type="button" className="secondary-btn" onClick={() => setModal(null)}>Cancel</button><button className={modal.kind === 'delete' ? 'danger-btn' : 'primary-btn'} disabled={busy}>{busy ? <><span className="spinner small" /> Verifying…</> : <>{meta.icon}{meta.action}</>}</button></div>
    </form>
    <div className="modal-foot"><ShieldCheck size={14} /> Up to 3 failed attempts before a temporary lockout</div>
  </div></div>;
}

function PreviewModal({ preview, onClose }) {
  const type = preview.type || '';
  return <div className="modal-backdrop preview-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className="preview-card">
    <div className="preview-header"><div className={`file-icon ${getKind(type, preview.file.name)}`}>{fileIcon(preview.file)}</div><div><strong>{preview.file.name}</strong><small>{formatBytes(preview.file.size)} · Decrypted for this preview only</small></div><button className="icon-btn" onClick={onClose}><X size={18} /></button></div>
    <div className="preview-body">{type.startsWith('image/') ? <img src={preview.url} alt={preview.file.name} /> :
      type.startsWith('video/') ? <video src={preview.url} controls /> :
      type.startsWith('audio/') ? <audio src={preview.url} controls /> :
      type === 'application/pdf' ? <iframe title={preview.file.name} src={preview.url} /> :
      type.startsWith('text/') ? <TextPreview url={preview.url} /> :
      <div className="preview-unsupported"><FileText size={30} /><strong>Preview not available</strong><span>Download this file to open it in a compatible app.</span></div>}</div>
    <div className="preview-foot"><LockKeyhole size={13} /> This temporary preview is not stored in your vault.</div>
  </div></div>;
}

function TextPreview({ url }) {
  const [text, setText] = useState('Loading preview…');
  useEffect(() => { fetch(url).then(res => res.text()).then(setText).catch(() => setText('Could not load preview.')); }, [url]);
  return <pre className="text-preview">{text.slice(0, 200000)}</pre>;
}

function EmptyState({ icon, title, copy, action, onClick }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><strong>{title}</strong><p>{copy}</p>{action && <button className="text-button" onClick={onClick}>{action} <ArrowUpRight size={14} /></button>}</div>;
}
