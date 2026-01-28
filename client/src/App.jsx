import { useState, useEffect } from 'react'
import './App.css'

const API_BASE = 'http://localhost:3456/api'

// Shared ConversationViewer component used by Activity tab
function ConversationViewer({
  conversation,
  loading,
  onClose,
  projectName,
  sessionId,
  showHeader = true
}) {
  const [copiedId, setCopiedId] = useState(null)

  const copyMessage = async (content, id) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const exportToMarkdown = () => {
    if (!conversation) return

    const name = projectName || 'conversation'
    const date = new Date().toISOString().split('T')[0]

    let markdown = `# ${name}\n\n`
    markdown += `**Session:** ${sessionId || 'unknown'}\n`
    markdown += `**Messages:** ${conversation.messageCount}\n`
    markdown += `**Exported:** ${date}\n\n---\n\n`

    conversation.messages?.forEach((msg) => {
      const role = msg.role === 'user' ? '**You:**' : '**Claude:**'
      markdown += `${role}\n\n${msg.content}\n\n---\n\n`
    })

    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}-${date}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return ''
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return <div className="conversation-loading">Loading conversation...</div>
  }

  if (!conversation) {
    return <div className="conversation-error">Could not load conversation</div>
  }

  return (
    <div className="conversation-viewer">
      {showHeader && (
        <div className="conversation-header">
          <div className="conversation-title">
            {projectName && <span className="conv-project">{projectName}</span>}
            <span className="conv-count">{conversation.messageCount} messages</span>
          </div>
          <div className="conversation-actions">
            <button className="conv-action-btn" onClick={exportToMarkdown} title="Export to Markdown">
              Export
            </button>
            {onClose && (
              <button className="conversation-close" onClick={onClose}>×</button>
            )}
          </div>
        </div>
      )}

      <div className="conversation-messages">
        {conversation.messages?.map((msg, i) => (
          <div key={i} className={`conv-message ${msg.role}`}>
            <div className="conv-role">
              {msg.role === 'user' ? '⟩ You' : '◆ Claude'}
              {msg.timestamp && (
                <span className="conv-time">{formatTime(msg.timestamp)}</span>
              )}
              <button
                className={`conv-copy-btn ${copiedId === i ? 'copied' : ''}`}
                onClick={() => copyMessage(msg.content, i)}
                title="Copy message"
              >
                {copiedId === i ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="conv-content">{msg.content}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Unified Activity Tab - merges Projects, History, and Insights
function ActivityTab({ projects, history, stats }) {
  const [search, setSearch] = useState('')
  const [selectedProject, setSelectedProject] = useState(null)
  const [selectedSession, setSelectedSession] = useState(null)
  const [conversation, setConversation] = useState(null)
  const [loadingConversation, setLoadingConversation] = useState(false)

  const getTimeAgo = (date) => {
    if (!date) return ''
    const now = new Date()
    const then = new Date(date)
    const diff = now - then
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return new Date(date).toLocaleDateString()
  }

  const loadSession = async (projectId, sessionId) => {
    setSelectedSession(sessionId)
    setLoadingConversation(true)
    try {
      const res = await fetch(`${API_BASE}/sessions/${projectId}/${sessionId}`)
      const data = await res.json()
      setConversation(data)
    } catch (error) {
      console.error('Failed to load session:', error)
      setConversation(null)
    } finally {
      setLoadingConversation(false)
    }
  }

  const closeConversation = () => {
    setSelectedSession(null)
    setConversation(null)
  }

  const closeProject = () => {
    setSelectedProject(null)
    setSelectedSession(null)
    setConversation(null)
  }

  const filteredProjects = search.trim()
    ? projects.filter(p =>
        p.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.path?.toLowerCase().includes(search.toLowerCase())
      )
    : projects

  if (projects.length === 0) {
    return (
      <div className="activity">
        <div className="activity-empty">
          <p>No projects found yet. Start using Claude Code in a project directory!</p>
        </div>
      </div>
    )
  }

  return (
    <div className="activity">
      {/* Header with search */}
      <div className="activity-header">
        <div className="activity-search">
          <input
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch('')}>×</button>
          )}
        </div>
      </div>

      {/* PROJECT GRID */}
      {!selectedProject && (
        <div className="activity-projects-grid">
          {filteredProjects.map(project => (
            <div
              key={project.id}
              className="activity-project-card"
              onClick={() => setSelectedProject(project.id)}
            >
              <div className="project-card-header">
                <h3>{project.name}</h3>
                <span className="project-time">{getTimeAgo(project.lastActivity)}</span>
              </div>
              <div className="project-card-path">{project.path}</div>
              <div className="project-card-stats">
                <span>{project.sessionCount} sessions</span>
                <span>{project.totalMessages || 0} messages</span>
              </div>
              {project.technologies?.length > 0 && (
                <div className="project-card-tech">
                  {project.technologies.slice(0, 3).map((tech, i) => (
                    <span key={i} className="tech-tag">{tech}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* PROJECT DETAIL VIEW */}
      {selectedProject && (
        <div className="activity-project-detail">
          <button className="back-btn" onClick={closeProject}>← Back</button>
          {(() => {
            const project = projects.find(p => p.id === selectedProject)
            if (!project) return null
            return (
              <>
                <div className="project-detail-header">
                  <h2>{project.name}</h2>
                  <span className="project-detail-path">{project.path}</span>
                </div>
                <div className="project-detail-content">
                  <div className="sessions-list">
                    <h3>Sessions</h3>
                    {project.sessions?.map(session => (
                      <div
                        key={session.id}
                        className={`session-item ${selectedSession === session.id ? 'active' : ''}`}
                        onClick={() => loadSession(project.id, session.id)}
                      >
                        <span className="session-id">{session.id.substring(0, 12)}...</span>
                        <span className="session-time">{getTimeAgo(session.lastModified)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="conversation-panel">
                    {!selectedSession ? (
                      <div className="conversation-placeholder">Select a session</div>
                    ) : (
                      <ConversationViewer
                        conversation={conversation}
                        loading={loadingConversation}
                        onClose={closeConversation}
                        projectName={project.name}
                        sessionId={selectedSession}
                      />
                    )}
                  </div>
                </div>
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// Unified Catalog Tab - merges MCP Servers and CLAUDE.md Examples
function CatalogTab() {
  const [resourceType, setResourceType] = useState('all') // 'all' | 'mcp' | 'agents'
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('popular')
  const [copiedId, setCopiedId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  const [mcpServers, setMcpServers] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll(forceRefresh = false) {
    try {
      if (forceRefresh) setRefreshing(true)
      const refreshParam = forceRefresh ? '?refresh=1' : ''
      const [mcpRes, agentsRes] = await Promise.all([
        fetch(`${API_BASE}/mcp${refreshParam}`),
        fetch(`${API_BASE}/agents${refreshParam}`)
      ])
      const mcpData = await mcpRes.json()
      const agentsData = await agentsRes.json()
      setMcpServers(mcpData.servers || [])
      setAgents(agentsData.agents || [])
    } catch (error) {
      console.error('Failed to fetch catalog:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const copyToClipboard = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const generateConfig = (mcp) => {
    const name = mcp.id.replace(/[^a-z0-9]/gi, '-').toLowerCase()
    if (mcp.install && mcp.install.startsWith('npx')) {
      const pkg = mcp.install.replace('npx -y ', '').replace('npx ', '')
      return `"${name}": {\n  "command": "npx",\n  "args": ["-y", "${pkg}"]\n}`
    }
    return `"${name}": {\n  "command": "node",\n  "args": ["path/to/server"]\n}`
  }

  // Unified categories
  const categories = [
    { id: 'all', name: 'All' },
    { id: 'core', name: 'Core' },
    { id: 'dev', name: 'Dev' },
    { id: 'frontend', name: 'Frontend' },
    { id: 'backend', name: 'Backend' },
    { id: 'database', name: 'Database' },
    { id: 'web', name: 'Web' },
    { id: 'cloud', name: 'Cloud' },
    { id: 'python', name: 'Python' },
    { id: 'typescript', name: 'TypeScript' },
    { id: 'other', name: 'Other' },
  ]

  // Normalize items from both sources
  const normalizedMcp = mcpServers.map(m => ({
    ...m,
    type: 'mcp',
    displayName: m.name,
    displayDesc: m.description,
    displayAuthor: m.author,
    displayStars: m.stars || 0,
    displayCategory: m.category || 'other'
  }))

  const normalizedAgents = agents.map(a => ({
    ...a,
    type: 'agent',
    displayName: a.name,
    displayDesc: a.description,
    displayAuthor: a.author,
    displayStars: a.stars || 0,
    displayCategory: a.category || 'general'
  }))

  // Combine and filter
  let results = []
  if (resourceType === 'all') {
    results = [...normalizedMcp, ...normalizedAgents]
  } else if (resourceType === 'mcp') {
    results = normalizedMcp
  } else {
    results = normalizedAgents
  }

  // Filter by category
  if (category !== 'all') {
    results = results.filter(r => r.displayCategory === category)
  }

  // Filter by search
  if (search.trim()) {
    const q = search.toLowerCase()
    results = results.filter(r =>
      r.displayName?.toLowerCase().includes(q) ||
      r.displayDesc?.toLowerCase().includes(q) ||
      r.displayAuthor?.toLowerCase().includes(q)
    )
  }

  // Sort
  results = [...results].sort((a, b) => {
    switch (sortBy) {
      case 'stars':
        return (b.displayStars || 0) - (a.displayStars || 0)
      case 'name':
        return (a.displayName || '').localeCompare(b.displayName || '')
      case 'popular':
      default:
        return ((b.useCount || 0) + (b.displayStars || 0)) -
               ((a.useCount || 0) + (a.displayStars || 0))
    }
  })

  if (loading) {
    return (
      <div className="catalog">
        <div className="catalog-loading">Loading catalog...</div>
      </div>
    )
  }

  return (
    <div className="catalog">
      {/* Header */}
      <div className="catalog-header">
        <div className="catalog-search">
          <input
            type="text"
            placeholder="Search tools & configs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch('')}>×</button>
          )}
        </div>
        <button
          className={`catalog-refresh ${refreshing ? 'refreshing' : ''}`}
          onClick={() => fetchAll(true)}
          disabled={refreshing}
        >
          {refreshing ? '...' : '↻'}
        </button>
      </div>

      {/* Filters */}
      <div className="catalog-filters">
        <div className="filter-group type-filter">
          <button
            className={resourceType === 'all' ? 'active' : ''}
            onClick={() => setResourceType('all')}
          >
            All
          </button>
          <button
            className={resourceType === 'mcp' ? 'active' : ''}
            onClick={() => setResourceType('mcp')}
          >
            MCP Servers
          </button>
          <button
            className={resourceType === 'agents' ? 'active' : ''}
            onClick={() => setResourceType('agents')}
          >
            CLAUDE.md
          </button>
        </div>
        <div className="filter-group category-filter">
          {categories.slice(0, 8).map(cat => (
            <button
              key={cat.id}
              className={category === cat.id ? 'active' : ''}
              onClick={() => setCategory(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>
        <div className="filter-group sort-filter">
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="popular">Popular</option>
            <option value="stars">Stars</option>
            <option value="name">Name A-Z</option>
          </select>
        </div>
      </div>

      {/* Results count */}
      <div className="catalog-count">{results.length} resources</div>

      {/* Results grid */}
      <div className="catalog-grid">
        {results.map((item) => (
          <div key={`${item.type}-${item.id}`} className={`catalog-card ${item.type}`}>
            <div className="card-header">
              <span className={`card-type-badge ${item.type}`}>
                {item.type === 'mcp' ? 'MCP' : 'CLAUDE.md'}
              </span>
              <span className="card-stars">★ {item.displayStars}</span>
            </div>
            <h3 className="card-name">{item.displayName}</h3>
            <p className="card-desc">{item.displayDesc}</p>
            <div className="card-meta">
              <span className="card-author">{item.displayAuthor}</span>
              <span className="card-category">{item.displayCategory}</span>
            </div>

            {/* MCP specific content */}
            {item.type === 'mcp' && (
              <div className="card-mcp-content">
                {item.install && (
                  <code className="card-install">{item.install}</code>
                )}
                <div className="card-actions">
                  <button
                    className={copiedId === `config-${item.id}` ? 'copied' : ''}
                    onClick={() => copyToClipboard(generateConfig(item), `config-${item.id}`)}
                  >
                    {copiedId === `config-${item.id}` ? 'Copied!' : 'Copy Config'}
                  </button>
                  {item.github && (
                    <a href={item.github} target="_blank" rel="noopener noreferrer">GitHub</a>
                  )}
                </div>
                {expandedId === item.id && (
                  <pre className="card-config">{generateConfig(item)}</pre>
                )}
              </div>
            )}

            {/* Agent specific content */}
            {item.type === 'agent' && (
              <div className="card-agent-content">
                {item.topics?.length > 0 && (
                  <div className="card-topics">
                    {item.topics.slice(0, 4).map((t, i) => (
                      <span key={i} className="topic-tag">{t}</span>
                    ))}
                  </div>
                )}
                <div className="card-actions">
                  {item.claudeMd && (
                    <button
                      className={copiedId === `claude-${item.id}` ? 'copied' : ''}
                      onClick={() => copyToClipboard(item.claudeMd, `claude-${item.id}`)}
                    >
                      {copiedId === `claude-${item.id}` ? 'Copied!' : 'Copy CLAUDE.md'}
                    </button>
                  )}
                  {item.github && (
                    <a href={item.github} target="_blank" rel="noopener noreferrer">GitHub</a>
                  )}
                </div>
                {expandedId === item.id && item.claudeMd && (
                  <pre className="card-preview">{item.claudeMd.substring(0, 500)}...</pre>
                )}
              </div>
            )}

            <button
              className="card-expand"
              onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
            >
              {expandedId === item.id ? 'Less' : 'More'}
            </button>
          </div>
        ))}
      </div>

      {results.length === 0 && (
        <div className="catalog-empty">No resources found matching your criteria</div>
      )}
    </div>
  )
}

// Check if running in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [stats, setStats] = useState(null)
  const [history, setHistory] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      const [statsRes, historyRes, projectsRes] = await Promise.all([
        fetch(`${API_BASE}/stats`),
        fetch(`${API_BASE}/history`),
        fetch(`${API_BASE}/projects`)
      ])

      setStats(await statsRes.json())
      setHistory(await historyRes.json())
      setProjects(await projectsRes.json())
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="loading">Loading Claude Dashboard...</div>
  }

  // Handle close button click
  const handleClose = () => {
    if (isElectron && window.electronAPI?.hideWindow) {
      window.electronAPI.hideWindow()
    }
  }

  return (
    <div className={`app ${isElectron ? 'electron-app' : ''}`}>
      <header className="header">
        <div className={`terminal-bar ${isElectron ? 'electron-titlebar' : ''}`}>
          <div className="terminal-dots">
            <span
              className="terminal-dot red"
              onClick={handleClose}
              title={isElectron ? "Hide to tray" : ""}
              style={isElectron ? { cursor: 'pointer' } : {}}
            ></span>
            <span className="terminal-dot yellow"></span>
            <span className="terminal-dot green"></span>
          </div>
          <div className="terminal-title electron-drag-region">
            {isElectron ? 'ClaudeBuddy' : 'claudebuddy — zsh — 80×24'}
          </div>
          {isElectron && (
            <button
              className="electron-close-btn"
              onClick={handleClose}
              title="Hide to tray (Cmd+Q to quit)"
            >
              ×
            </button>
          )}
        </div>
        <div className="header-content">
          <h1>ClaudeBuddy</h1>
          <nav className="nav">
            <button
              className={activeTab === 'dashboard' ? 'active' : ''}
              onClick={() => setActiveTab('dashboard')}
            >
              stats
            </button>
            <button
              className={activeTab === 'activity' ? 'active' : ''}
              onClick={() => setActiveTab('activity')}
            >
              activity
            </button>
            <button
              className={activeTab === 'catalog' ? 'active' : ''}
              onClick={() => setActiveTab('catalog')}
            >
              catalog
            </button>
            <button
              className={activeTab === 'snippets' ? 'active' : ''}
              onClick={() => setActiveTab('snippets')}
            >
              snippets
            </button>
            <button
              className={activeTab === 'research' ? 'active' : ''}
              onClick={() => setActiveTab('research')}
            >
              research
            </button>
          </nav>
        </div>
      </header>

      <main className="main">
        {activeTab === 'dashboard' && (
          <DashboardTab stats={stats} projects={projects} history={history} />
        )}
        {activeTab === 'activity' && (
          <ActivityTab projects={projects} history={history} stats={stats} />
        )}
        {activeTab === 'catalog' && (
          <CatalogTab />
        )}
        {activeTab === 'snippets' && (
          <SnippetsTab projects={projects} />
        )}
        {activeTab === 'research' && (
          <ResearchTab projects={projects} />
        )}
      </main>
    </div>
  )
}

function DashboardTab({ stats, projects, history }) {
  // Check if there's no data (new user)
  // Check multiple indicators: no projects, no history, no daily activity
  const hasNoData = projects.length === 0 && history.length === 0 && (!stats?.stats?.dailyActivity || stats.stats.dailyActivity.length === 0)

  if (hasNoData) {
    return (
      <div className="dashboard">
        <div className="welcome-state">
          <h2>Welcome to ClaudeBuddy</h2>
          <p>No Claude Code data found yet.</p>
          <div className="welcome-steps">
            <div className="welcome-step">
              <span className="step-num">1</span>
              <span className="step-text">Install Claude Code from <a href="https://claude.ai/code" target="_blank" rel="noopener noreferrer">claude.ai/code</a></span>
            </div>
            <div className="welcome-step">
              <span className="step-num">2</span>
              <span className="step-text">Run <code>claude</code> in any project directory</span>
            </div>
            <div className="welcome-step">
              <span className="step-num">3</span>
              <span className="step-text">Your sessions and stats will appear here automatically</span>
            </div>
          </div>
          <p className="welcome-hint">Check out the FAQ tab for helpful tips and shortcuts!</p>
        </div>
      </div>
    )
  }

  // Calculate total tokens from modelUsage
  const totalTokens = stats?.stats?.modelUsage
    ? Object.values(stats.stats.modelUsage).reduce((sum, m) =>
        sum + (m.inputTokens || 0) + (m.outputTokens || 0), 0)
    : 0

  // Get total sessions from stats
  const totalSessions = stats?.stats?.totalSessions || 0

  // Get cost data
  const totalCost = stats?.costs?.total || 0
  const costByModel = stats?.costs?.byModel || {}

  // Get chart data
  const dailyActivity = stats?.charts?.dailyActivity || []
  const dailyTokens = stats?.charts?.dailyTokens || []

  // Flatten grouped history to get recent prompts
  const recentActivity = []
  for (const day of history) {
    for (const session of day.sessions || []) {
      for (const prompt of session.prompts || []) {
        recentActivity.push({
          text: prompt.text,
          timestamp: prompt.timestamp,
          project: session.projectName
        })
      }
    }
  }
  // Sort by timestamp and take recent 5
  recentActivity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  const recent5 = recentActivity.slice(0, 5)

  // Count total prompts
  const totalPrompts = recentActivity.length

  // Format cost
  const formatCost = (cost) => {
    if (cost < 0.01) return '<$0.01'
    return `$${cost.toFixed(2)}`
  }

  // Format large numbers
  const formatNumber = (num) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
    return num.toString()
  }

  // Get max value for chart scaling
  const maxMessages = Math.max(...dailyActivity.map(d => d.messages), 1)
  const maxTokens = Math.max(...dailyTokens.map(d => d.tokens), 1)

  return (
    <div className="dashboard">
      {/* Main Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Sessions</h3>
          <div className="stat-value">{totalSessions}</div>
        </div>
        <div className="stat-card">
          <h3>Projects</h3>
          <div className="stat-value">{projects.length}</div>
        </div>
        <div className="stat-card">
          <h3>Prompts</h3>
          <div className="stat-value">{totalPrompts}</div>
        </div>
        <div className="stat-card highlight">
          <h3>Est. Cost</h3>
          <div className="stat-value cost">{formatCost(totalCost)}</div>
        </div>
      </div>

      {/* Cost Breakdown */}
      {Object.keys(costByModel).length > 0 && (
        <div className="cost-section">
          <h2>Cost Breakdown</h2>
          <div className="cost-breakdown">
            {Object.entries(costByModel).map(([model, data]) => (
              <div key={model} className="cost-item">
                <div className="cost-model">
                  <span className="model-name">{model.replace('claude-', '').replace(/-\d+$/, '')}</span>
                  <span className="model-cost">{formatCost(data.cost)}</span>
                </div>
                <div className="cost-details">
                  <span>In: {formatNumber(data.inputTokens)}</span>
                  <span>Out: {formatNumber(data.outputTokens)}</span>
                  <span>Cache: {formatNumber(data.cacheReadTokens + data.cacheWriteTokens)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity Chart */}
      {dailyActivity.length > 0 && (
        <div className="chart-section">
          <h2>Daily Activity</h2>
          <div className="chart">
            <div className="chart-bars">
              {dailyActivity.slice(-14).map((day, i) => (
                <div key={i} className="chart-bar-group">
                  <div
                    className="chart-bar"
                    style={{ height: `${(day.messages / maxMessages) * 100}%` }}
                    title={`${day.messages} messages`}
                  />
                  <span className="chart-label">{day.date.slice(5)}</span>
                </div>
              ))}
            </div>
            <div className="chart-legend">
              <span>Messages per day (last 14 days)</span>
            </div>
          </div>
        </div>
      )}

      {/* Token Usage Chart */}
      {dailyTokens.length > 0 && (
        <div className="chart-section">
          <h2>Token Usage</h2>
          <div className="chart">
            <div className="chart-bars tokens">
              {dailyTokens.slice(-14).map((day, i) => (
                <div key={i} className="chart-bar-group">
                  <div
                    className="chart-bar"
                    style={{ height: `${(day.tokens / maxTokens) * 100}%` }}
                    title={`${formatNumber(day.tokens)} tokens`}
                  />
                  <span className="chart-label">{day.date.slice(5)}</span>
                </div>
              ))}
            </div>
            <div className="chart-legend">
              <span>Tokens per day (last 14 days)</span>
            </div>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="recent-section">
        <h2>Recent Activity</h2>
        <div className="recent-list">
          {recent5.length > 0 ? recent5.map((item, i) => (
            <div key={i} className="recent-item">
              <span className="recent-text">{item.text?.substring(0, 80)}...</span>
              <span className="recent-time">{new Date(item.timestamp).toLocaleDateString()}</span>
            </div>
          )) : (
            <div className="recent-item">
              <span className="recent-text">No recent activity</span>
            </div>
          )}
        </div>
      </div>

      {/* Recent Projects */}
      <div className="recent-section">
        <h2>Recent Projects</h2>
        <div className="recent-list">
          {projects.slice(0, 5).map((project, i) => (
            <div key={i} className="recent-item">
              <span className="recent-text">{project.name || project.path}</span>
              <span className="recent-meta">{project.sessionCount} sessions</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Snippets Tab - discover markdown files across all projects
function SnippetsTab({ projects }) {
  const [data, setData] = useState({ files: [], by_project: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [showCopyTo, setShowCopyTo] = useState(false)

  useEffect(() => {
    fetchFiles()
  }, [])

  async function fetchFiles() {
    try {
      const res = await fetch(`${API_BASE}/snippets`)
      const result = await res.json()
      setData(result)
    } catch (error) {
      console.error('Failed to fetch:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadFile(filePath) {
    try {
      const res = await fetch(`${API_BASE}/snippets/file?path=${encodeURIComponent(filePath)}`)
      const result = await res.json()
      setSelected(result)
    } catch (error) {
      console.error('Failed to load file:', error)
    }
  }

  async function copyToProject(targetPath) {
    try {
      const res = await fetch(`${API_BASE}/snippets/copy?path=${encodeURIComponent(selected.path)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_project: targetPath, mode: 'append' })
      })
      if (res.ok) {
        alert(`Added to ${targetPath}/CLAUDE.md`)
        setShowCopyTo(false)
      }
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId('copied')
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  if (loading) {
    return (
      <div className="snippets">
        <div className="snippets-loading">Scanning projects...</div>
      </div>
    )
  }

  return (
    <div className="snippets">
      {/* Header */}
      <div className="snippets-header">
        <div>
          <h2>Markdown Files</h2>
          <span className="snippets-count">{data.total} files across {data.by_project.length} projects</span>
        </div>
        <button className="snippet-btn" onClick={fetchFiles}>Refresh</button>
      </div>

      {/* Selected file view */}
      {selected && (
        <div className="snippet-detail">
          <div className="snippet-detail-header">
            <button className="back-btn" onClick={() => { setSelected(null); setShowCopyTo(false) }}>Back</button>
            <h3>{selected.title}</h3>
            <div className="snippet-actions">
              <button
                className={`snippet-btn ${copiedId ? 'copied' : ''}`}
                onClick={() => copyToClipboard(selected.content)}
              >
                {copiedId ? 'Copied!' : 'Copy'}
              </button>
              <button className="snippet-btn primary" onClick={() => setShowCopyTo(true)}>
                Add to Project
              </button>
            </div>
          </div>

          <div className="file-path-info">{selected.path}</div>

          {/* Project picker */}
          {showCopyTo && (
            <div className="inject-picker">
              <p>Append to which project's CLAUDE.md?</p>
              {projects.map(p => (
                <button
                  key={p.id}
                  className="inject-project-btn"
                  onClick={() => copyToProject(p.path)}
                >
                  {p.name}
                </button>
              ))}
              <button className="snippet-btn" onClick={() => setShowCopyTo(false)}>Cancel</button>
            </div>
          )}

          <div className="snippet-content">
            <pre>{selected.content}</pre>
          </div>
        </div>
      )}

      {/* Files grouped by project */}
      {!selected && (
        <>
          {data.by_project.length === 0 ? (
            <div className="snippets-empty">
              <p>No markdown files found.</p>
              <p>Add .md files to your projects.</p>
            </div>
          ) : (
            <div className="projects-files-list">
              {data.by_project.map(proj => (
                <div key={proj.project_path} className="project-files-group">
                  <div className="project-files-header">
                    <span className="project-files-name">{proj.project_name}</span>
                    <span className="project-files-count">{proj.files.length} files</span>
                  </div>
                  <div className="project-files">
                    {proj.files.map(f => (
                      <div
                        key={f.path}
                        className="file-item"
                        onClick={() => loadFile(f.path)}
                      >
                        <span className="file-name">{f.filename}</span>
                        <span className="file-preview">{f.preview}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ResearchTab({ projects }) {
  const [query, setQuery] = useState('')
  const [selectedProject, setSelectedProject] = useState('')
  const [newProjectPath, setNewProjectPath] = useState('')
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [maxSearches, setMaxSearches] = useState(5)
  const [isResearching, setIsResearching] = useState(false)
  const [currentTask, setCurrentTask] = useState(null)
  const [taskStatus, setTaskStatus] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [events, setEvents] = useState([])

  // Set default project when projects load
  useEffect(() => {
    if (projects.length > 0 && !selectedProject && !isCreatingNew) {
      setSelectedProject(projects[0].path)
    }
  }, [projects])

  const handleProjectChange = (e) => {
    const value = e.target.value
    if (value === '__create_new__') {
      setIsCreatingNew(true)
      setSelectedProject('')
    } else {
      setIsCreatingNew(false)
      setSelectedProject(value)
      setNewProjectPath('')
    }
  }

  const getEffectiveProjectPath = () => {
    return isCreatingNew ? newProjectPath.trim() : selectedProject
  }

  const startResearch = async () => {
    const targetPath = getEffectiveProjectPath()
    if (!query.trim() || !targetPath) {
      setError('Please enter a research query and select or create a project')
      return
    }

    setIsResearching(true)
    setError(null)
    setResult(null)
    setEvents([])
    setTaskStatus(null)

    try {
      // Start research task
      const response = await fetch(`${API_BASE}/research/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          target_project: targetPath,
          max_searches: maxSearches,
          search_depth: 'advanced'
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || 'Failed to start research')
      }

      const data = await response.json()
      setCurrentTask(data.task_id)

      // Start polling for status
      pollTaskStatus(data.task_id)

      // Connect to SSE stream for real-time updates
      const eventSource = new EventSource(`${API_BASE}/research/${data.task_id}/stream`)
      
      eventSource.onmessage = (event) => {
        try {
          const eventData = JSON.parse(event.data)
          setEvents(prev => [...prev, eventData])
          
          if (eventData.type === 'progress') {
            setTaskStatus(prev => ({
              ...prev,
              search_count: eventData.data.search_count,
              findings_count: eventData.data.findings_count,
              current_phase: eventData.data.phase
            }))
          } else if (eventData.type === 'complete') {
            fetchResult(data.task_id)
            eventSource.close()
          } else if (eventData.type === 'error') {
            setError(eventData.data)
            eventSource.close()
            setIsResearching(false)
          }
        } catch (e) {
          console.error('Failed to parse event:', e)
        }
      }

      eventSource.onerror = () => {
        eventSource.close()
      }

    } catch (err) {
      setError(err.message)
      setIsResearching(false)
    }
  }

  const pollTaskStatus = async (taskId) => {
    const poll = async () => {
      try {
        const response = await fetch(`${API_BASE}/research/${taskId}/status`)
        const data = await response.json()
        setTaskStatus(data)

        if (data.status === 'completed') {
          fetchResult(taskId)
        } else if (data.status === 'failed') {
          setError(data.error || 'Research failed')
          setIsResearching(false)
        } else if (data.status !== 'cancelled') {
          // Continue polling
          setTimeout(poll, 2000)
        }
      } catch (e) {
        console.error('Poll error:', e)
      }
    }

    poll()
  }

  const fetchResult = async (taskId) => {
    try {
      const response = await fetch(`${API_BASE}/research/${taskId}/result`)
      const data = await response.json()
      setResult(data)
      setIsResearching(false)
    } catch (e) {
      console.error('Failed to fetch result:', e)
      setIsResearching(false)
    }
  }

  const cancelResearch = async () => {
    if (!currentTask) return

    try {
      await fetch(`${API_BASE}/research/${currentTask}`, {
        method: 'DELETE'
      })
      setIsResearching(false)
      setCurrentTask(null)
    } catch (e) {
      console.error('Failed to cancel:', e)
    }
  }

  const copyResult = () => {
    if (result?.summary) {
      navigator.clipboard.writeText(result.summary)
    }
  }

  return (
    <div className="research">
      <div className="research-header">
        <h2>Supervisor Agent Research</h2>
        <p className="research-intro">
          Use the Supervisor Agent to research any topic. The agent will search the web,
          synthesize findings, and save a comprehensive summary to your project.
        </p>
      </div>

      {!isResearching && !result && (
        <div className="research-form">
          <div className="research-field">
            <label htmlFor="research-query">Research Query</label>
            <textarea
              id="research-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What would you like to research? e.g., 'Best practices for implementing authentication in React applications'"
              rows={4}
            />
          </div>

          <div className="research-field">
            <label htmlFor="target-project">Target Project</label>
            <select
              id="target-project"
              value={isCreatingNew ? '__create_new__' : selectedProject}
              onChange={handleProjectChange}
            >
              <option value="">Select a project...</option>
              {projects.map(project => (
                <option key={project.id} value={project.path}>
                  {project.name} ({project.path})
                </option>
              ))}
              <option value="__create_new__">+ Create New Project...</option>
            </select>
            {isCreatingNew && (
              <input
                type="text"
                className="new-project-input"
                value={newProjectPath}
                onChange={(e) => setNewProjectPath(e.target.value)}
                placeholder="Enter full path, e.g., /Users/username/Documents/my-project"
                style={{ marginTop: '8px' }}
              />
            )}
            <span className="field-hint">
              {isCreatingNew
                ? 'Enter the full path where the .research/ directory will be created'
                : "Research results will be saved to this project's .research/ directory"
              }
            </span>
          </div>

          <div className="research-field">
            <label htmlFor="max-searches">Max Searches</label>
            <div className="range-input">
              <input
                type="range"
                id="max-searches"
                min="2"
                max="10"
                value={maxSearches}
                onChange={(e) => setMaxSearches(parseInt(e.target.value))}
              />
              <span className="range-value">{maxSearches}</span>
            </div>
            <span className="field-hint">The supervisor will decide when to stop based on information sufficiency</span>
          </div>

          {error && (
            <div className="research-error">
              {error}
            </div>
          )}

          <button
            className="research-start-btn"
            onClick={startResearch}
            disabled={!query.trim() || !getEffectiveProjectPath()}
          >
            Start Research
          </button>
        </div>
      )}

      {isResearching && (
        <div className="research-progress">
          <div className="progress-header">
            <h3>Research in Progress</h3>
            <button className="cancel-btn" onClick={cancelResearch}>Cancel</button>
          </div>

          <div className="progress-query">
            <span className="label">Query:</span>
            <span className="value">{query}</span>
          </div>

          <div className="progress-stats">
            <div className="progress-stat">
              <span className="stat-label">Searches</span>
              <span className="stat-value">{taskStatus?.search_count || 0} / {maxSearches}</span>
            </div>
            <div className="progress-stat">
              <span className="stat-label">Findings</span>
              <span className="stat-value">{taskStatus?.findings_count || 0}</span>
            </div>
            <div className="progress-stat">
              <span className="stat-label">Phase</span>
              <span className="stat-value phase">{taskStatus?.current_phase || 'starting'}</span>
            </div>
          </div>

          <div className="progress-bar-container">
            <div 
              className="progress-bar" 
              style={{ width: `${((taskStatus?.search_count || 0) / maxSearches) * 100}%` }}
            />
          </div>

          <div className="progress-events">
            {events.slice(-5).map((event, i) => (
              <div key={i} className={`event-item ${event.type}`}>
                <span className="event-type">[{event.type}]</span>
                <span className="event-data">
                  {typeof event.data === 'string' ? event.data : JSON.stringify(event.data)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result && (
        <div className="research-result">
          <div className="result-header">
            <h3>Research Complete</h3>
            <div className="result-actions">
              <button className="copy-btn" onClick={copyResult}>Copy Summary</button>
              <button className="new-btn" onClick={() => {
                setResult(null)
                setQuery('')
                setCurrentTask(null)
              }}>New Research</button>
            </div>
          </div>

          <div className="result-meta">
            <span className="meta-item">
              <span className="label">Status:</span>
              <span className={`value ${result.status}`}>{result.status}</span>
            </span>
            <span className="meta-item">
              <span className="label">Sources:</span>
              <span className="value">{result.findings?.length || 0}</span>
            </span>
            {result.saved_path && (
              <span className="meta-item">
                <span className="label">Saved to:</span>
                <span className="value path">{result.saved_path}</span>
              </span>
            )}
          </div>

          {result.error && (
            <div className="result-error">
              Error: {result.error}
            </div>
          )}

          {result.summary && (
            <div className="result-summary">
              <h4>Summary</h4>
              <div className="summary-content">
                {result.summary.split('\n').map((line, i) => {
                  if (line.startsWith('# ')) {
                    return <h2 key={i}>{line.slice(2)}</h2>
                  } else if (line.startsWith('## ')) {
                    return <h3 key={i}>{line.slice(3)}</h3>
                  } else if (line.startsWith('### ')) {
                    return <h4 key={i}>{line.slice(4)}</h4>
                  } else if (line.startsWith('- ') || line.startsWith('* ')) {
                    return <li key={i}>{line.slice(2)}</li>
                  } else if (line.startsWith('**') && line.endsWith('**')) {
                    return <p key={i}><strong>{line.slice(2, -2)}</strong></p>
                  } else if (line.trim()) {
                    return <p key={i}>{line}</p>
                  }
                  return null
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default App
