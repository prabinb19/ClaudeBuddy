import { useState, useEffect } from 'react'
import './App.css'

const API_BASE = 'http://localhost:3456/api'

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

  return (
    <div className="app">
      <header className="header">
        <div className="terminal-bar">
          <div className="terminal-dots">
            <span className="terminal-dot red"></span>
            <span className="terminal-dot yellow"></span>
            <span className="terminal-dot green"></span>
          </div>
          <div className="terminal-title">claudebuddy — zsh — 80×24</div>
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
              className={activeTab === 'projects' ? 'active' : ''}
              onClick={() => setActiveTab('projects')}
            >
              projects
            </button>
            <button
              className={activeTab === 'history' ? 'active' : ''}
              onClick={() => setActiveTab('history')}
            >
              history
            </button>
            <button
              className={activeTab === 'faq' ? 'active' : ''}
              onClick={() => setActiveTab('faq')}
            >
              faq
            </button>
            <button
              className={activeTab === 'mcp' ? 'active' : ''}
              onClick={() => setActiveTab('mcp')}
            >
              mcp
            </button>
            <button
              className={activeTab === 'productivity' ? 'active' : ''}
              onClick={() => setActiveTab('productivity')}
            >
              productivity
            </button>
          </nav>
        </div>
      </header>

      <main className="main">
        {activeTab === 'dashboard' && (
          <DashboardTab stats={stats} projects={projects} history={history} />
        )}
        {activeTab === 'projects' && (
          <ProjectsTab projects={projects} />
        )}
        {activeTab === 'history' && (
          <HistoryTab history={history} />
        )}
        {activeTab === 'faq' && (
          <FAQTab />
        )}
        {activeTab === 'mcp' && (
          <MCPTab />
        )}
        {activeTab === 'productivity' && (
          <ProductivityTab />
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

function ProjectsTab({ projects }) {
  const [selectedProject, setSelectedProject] = useState(null)
  const [selectedSession, setSelectedSession] = useState(null)
  const [conversation, setConversation] = useState(null)
  const [loadingConversation, setLoadingConversation] = useState(false)
  const [copiedId, setCopiedId] = useState(null)

  // Copy content to clipboard
  const copyMessage = async (content, id) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Export conversation to markdown
  const exportToMarkdown = () => {
    if (!conversation) return

    const project = projects.find(p => p.id === selectedProject)
    const projectName = project?.name || 'conversation'
    const date = new Date().toISOString().split('T')[0]

    let markdown = `# ${projectName}\n\n`
    markdown += `**Session:** ${selectedSession}\n`
    markdown += `**Messages:** ${conversation.messageCount}\n`
    markdown += `**Exported:** ${date}\n\n---\n\n`

    conversation.messages?.forEach((msg) => {
      const role = msg.role === 'user' ? '**You:**' : '**Claude:**'
      markdown += `${role}\n\n${msg.content}\n\n---\n\n`
    })

    // Create and download file
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectName}-${date}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const formatDate = (date) => {
    if (!date) return 'Unknown'
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

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
    return formatDate(date)
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

  const closeProject = () => {
    setSelectedProject(null)
    setSelectedSession(null)
    setConversation(null)
  }

  const closeConversation = () => {
    setSelectedSession(null)
    setConversation(null)
  }

  if (projects.length === 0) {
    return (
      <div className="projects">
        <div className="projects-empty">No projects found. Start using Claude Code in a project directory!</div>
      </div>
    )
  }

  // Detail view for selected project
  if (selectedProject) {
    const project = projects.find(p => p.id === selectedProject)
    if (!project) {
      setSelectedProject(null)
      return null
    }

    return (
      <div className="projects">
        <div className="project-detail">
          <div className="project-detail-header">
            <button className="back-btn" onClick={closeProject}>← Back to Projects</button>
            <h2 className="project-detail-name">{project.name}</h2>
            <span className="project-detail-activity">{getTimeAgo(project.lastActivity)}</span>
          </div>

          <div className="project-detail-path">{project.path}</div>

          <div className="project-detail-stats">
            <span className="stat">{project.sessionCount} sessions</span>
            <span className="stat">{project.totalMessages || 0} messages</span>
          </div>

          {project.technologies?.length > 0 && (
            <div className="project-detail-tech">
              {project.technologies.map((tech, i) => (
                <span key={i} className="tech-tag">{tech}</span>
              ))}
            </div>
          )}

          {project.topics?.length > 0 && (
            <div className="project-detail-topics">
              <span className="label">Work areas:</span>
              {project.topics.map((topic, i) => (
                <span key={i} className="topic-tag">{topic}</span>
              ))}
            </div>
          )}

          <div className="project-detail-content">
            <div className="project-sessions-panel">
              <h3>Sessions</h3>
              <div className="sessions-full-list">
                {project.sessions?.map(session => (
                  <div
                    key={session.id}
                    className={`session-card ${selectedSession === session.id ? 'active' : ''}`}
                    onClick={() => loadSession(project.id, session.id)}
                  >
                    <div className="session-card-header">
                      <span className="session-card-id">{session.id.substring(0, 12)}...</span>
                      <span className="session-card-date">{getTimeAgo(session.lastModified)}</span>
                    </div>
                    <div className="session-card-meta">
                      Click to view conversation
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="project-conversation-panel">
              {!selectedSession ? (
                <div className="conversation-placeholder">
                  Select a session to view the conversation
                </div>
              ) : loadingConversation ? (
                <div className="conversation-loading">Loading conversation...</div>
              ) : conversation ? (
                <>
                  <div className="conversation-panel-header">
                    <span className="conv-info">{conversation.messageCount} messages</span>
                    <div className="conversation-actions">
                      <button className="conv-action-btn" onClick={exportToMarkdown} title="Export to Markdown">
                        Export
                      </button>
                      <button className="conv-close" onClick={closeConversation}>×</button>
                    </div>
                  </div>
                  <div className="conversation-messages-list">
                    {conversation.messages?.map((msg, i) => (
                      <div key={i} className={`conv-message ${msg.role}`}>
                        <div className="conv-role">
                          {msg.role === 'user' ? '⟩ You' : '◆ Claude'}
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
                </>
              ) : (
                <div className="conversation-error">Could not load conversation</div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Grid view of all projects
  return (
    <div className="projects">
      <div className="projects-grid">
        {projects.map(project => (
          <div
            key={project.id}
            className="project-card clickable"
            onClick={() => setSelectedProject(project.id)}
          >
            <div className="project-header">
              <h3 className="project-name">{project.name}</h3>
              <span className="project-activity">{getTimeAgo(project.lastActivity)}</span>
            </div>

            <div className="project-path">{project.path}</div>

            <div className="project-stats">
              <span className="stat">{project.sessionCount} sessions</span>
              <span className="stat">{project.totalMessages || 0} messages</span>
            </div>

            {project.technologies?.length > 0 && (
              <div className="project-tech">
                {project.technologies.map((tech, i) => (
                  <span key={i} className="tech-tag">{tech}</span>
                ))}
              </div>
            )}

            {project.topics?.length > 0 && (
              <div className="project-topics">
                <span className="topics-label">Recent work:</span>
                <div className="topics-list">
                  {project.topics.map((topic, i) => (
                    <span key={i} className="topic-tag">{topic}</span>
                  ))}
                </div>
              </div>
            )}

            {project.recentTasks?.length > 0 && (
              <div className="project-tasks">
                <span className="tasks-label">Recent tasks:</span>
                <ul className="tasks-list">
                  {project.recentTasks.map((task, i) => (
                    <li key={i}>{task}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="project-click-hint">Click to view sessions →</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function HistoryTab({ history }) {
  const [search, setSearch] = useState('')
  const [selectedSession, setSelectedSession] = useState(null)
  const [conversation, setConversation] = useState(null)
  const [loadingConversation, setLoadingConversation] = useState(false)
  const [expandedDates, setExpandedDates] = useState({})
  const [copiedId, setCopiedId] = useState(null)

  // Copy message content to clipboard
  const copyMessage = async (content, id) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Export conversation to markdown
  const exportToMarkdown = () => {
    if (!conversation) return

    const projectName = conversation.project?.split('/').pop() || 'conversation'
    const date = new Date().toISOString().split('T')[0]

    let markdown = `# ${projectName}\n\n`
    markdown += `**Session:** ${selectedSession}\n`
    markdown += `**Messages:** ${conversation.messageCount}\n`
    markdown += `**Exported:** ${date}\n\n---\n\n`

    conversation.messages?.forEach((msg) => {
      const role = msg.role === 'user' ? '**You:**' : '**Claude:**'
      markdown += `${role}\n\n${msg.content}\n\n---\n\n`
    })

    // Create and download file
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectName}-${date}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Filter sessions by search across all dates
  const filteredHistory = search.trim()
    ? history.map(day => ({
        ...day,
        sessions: day.sessions.filter(s =>
          s.projectName?.toLowerCase().includes(search.toLowerCase()) ||
          s.topic?.toLowerCase().includes(search.toLowerCase()) ||
          s.prompts?.some(p => p.text?.toLowerCase().includes(search.toLowerCase()))
        )
      })).filter(day => day.sessions.length > 0)
    : history

  // Auto-expand first date
  useEffect(() => {
    if (history.length > 0 && Object.keys(expandedDates).length === 0) {
      setExpandedDates({ [history[0].date]: true })
    }
  }, [history])

  const toggleDate = (date) => {
    setExpandedDates(prev => ({ ...prev, [date]: !prev[date] }))
  }

  const loadConversation = async (sessionId) => {
    setSelectedSession(sessionId)
    setLoadingConversation(true)
    try {
      const res = await fetch(`${API_BASE}/history/session/${sessionId}`)
      const data = await res.json()
      setConversation(data)
    } catch (error) {
      console.error('Failed to load conversation:', error)
      setConversation(null)
    } finally {
      setLoadingConversation(false)
    }
  }

  const closeConversation = () => {
    setSelectedSession(null)
    setConversation(null)
  }

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="history">
      <div className="history-header">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search history..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch('')}>×</button>
          )}
        </div>
      </div>

      <div className="history-content">
        <div className={`history-sidebar ${selectedSession ? 'collapsed' : ''}`}>
          {filteredHistory.map((day) => (
            <div key={day.date} className="history-day">
              <button
                className={`history-day-header ${expandedDates[day.date] ? 'expanded' : ''}`}
                onClick={() => toggleDate(day.date)}
              >
                <span className="day-toggle">{expandedDates[day.date] ? '▼' : '▶'}</span>
                <span className="day-date">{day.date}</span>
                <span className="day-count">{day.sessions.length} sessions</span>
              </button>

              {expandedDates[day.date] && (
                <div className="history-sessions">
                  {day.sessions.map((session) => (
                    <div
                      key={session.sessionId}
                      className={`history-session ${selectedSession === session.sessionId ? 'active' : ''}`}
                      onClick={() => loadConversation(session.sessionId)}
                    >
                      <div className="session-header">
                        <span className="session-project">{session.projectName}</span>
                        <span className="session-time">
                          {formatTime(session.firstTimestamp)}
                        </span>
                      </div>
                      <div className="session-topic">{session.topic}</div>
                      <div className="session-preview">{session.preview}</div>
                      <div className="session-stats">
                        <span>{session.promptCount} prompts</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {filteredHistory.length === 0 && (
            <div className="history-empty">
              {search ? `No sessions found matching "${search}"` : 'No history found'}
            </div>
          )}
        </div>

        {selectedSession && (
          <div className="history-conversation">
            <div className="conversation-header">
              <div className="conversation-title">
                {conversation ? (
                  <>
                    <span className="conv-project">{conversation.project?.split('/').pop()}</span>
                    <span className="conv-count">{conversation.messageCount} messages</span>
                  </>
                ) : (
                  <span>Loading...</span>
                )}
              </div>
              <div className="conversation-actions">
                {conversation && (
                  <button className="conv-action-btn" onClick={exportToMarkdown} title="Export to Markdown">
                    Export
                  </button>
                )}
                <button className="conversation-close" onClick={closeConversation}>×</button>
              </div>
            </div>

            <div className="conversation-messages">
              {loadingConversation ? (
                <div className="conversation-loading">Loading conversation...</div>
              ) : conversation?.messages ? (
                conversation.messages.map((msg, i) => (
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
                ))
              ) : (
                <div className="conversation-error">Could not load conversation</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function FAQTab() {
  const [activeSection, setActiveSection] = useState('shortcuts')

  const sections = {
    shortcuts: {
      title: 'Keyboard Shortcuts',
      items: [
        { key: 'Ctrl+C', desc: 'Cancel current operation / interrupt Claude' },
        { key: 'Ctrl+D', desc: 'Exit Claude Code' },
        { key: 'Ctrl+L', desc: 'Clear terminal screen' },
        { key: 'Ctrl+R', desc: 'Search command history' },
        { key: 'Up/Down', desc: 'Navigate through previous prompts' },
        { key: 'Tab', desc: 'Autocomplete file paths and commands' },
        { key: 'Esc', desc: 'Cancel current input / close dialogs' },
        { key: 'Shift+Enter', desc: 'Multi-line input mode' },
      ]
    },
    commands: {
      title: 'Slash Commands',
      items: [
        { key: '/help', desc: 'Show all available commands and help' },
        { key: '/clear', desc: 'Clear conversation history' },
        { key: '/compact', desc: 'Summarize conversation to reduce context' },
        { key: '/config', desc: 'Open Claude Code configuration' },
        { key: '/cost', desc: 'Show token usage and estimated cost' },
        { key: '/doctor', desc: 'Check system health and diagnose issues' },
        { key: '/init', desc: 'Initialize project with CLAUDE.md file' },
        { key: '/login', desc: 'Authenticate with Anthropic' },
        { key: '/logout', desc: 'Log out of current session' },
        { key: '/memory', desc: 'View and edit memory/context files' },
        { key: '/model', desc: 'Switch between Claude models' },
        { key: '/permissions', desc: 'Manage tool permissions' },
        { key: '/review', desc: 'Review recent code changes' },
        { key: '/terminal-setup', desc: 'Configure terminal integration' },
        { key: '/vim', desc: 'Toggle vim keybindings mode' },
      ]
    },
    flags: {
      title: 'CLI Flags',
      items: [
        { key: '--help, -h', desc: 'Show help information' },
        { key: '--version, -v', desc: 'Show Claude Code version' },
        { key: '--print, -p', desc: 'Print response without interactive mode' },
        { key: '--output-format', desc: 'Set output format (text, json, stream-json)' },
        { key: '--verbose', desc: 'Enable verbose logging' },
        { key: '--max-turns', desc: 'Limit number of agentic turns' },
        { key: '--model', desc: 'Specify model to use' },
        { key: '--permission-mode', desc: 'Set permission mode (default, auto-accept)' },
        { key: '--resume, -r', desc: 'Resume previous conversation' },
        { key: '--continue, -c', desc: 'Continue most recent conversation' },
        { key: '--dangerously-skip-permissions', desc: 'Skip all permission prompts (use with caution)' },
      ]
    },
    tips: {
      title: 'Pro Tips',
      items: [
        { key: '@file', desc: 'Reference files directly: @src/app.js or @package.json' },
        { key: 'CLAUDE.md', desc: 'Create project instructions that persist across sessions' },
        { key: '.claudeignore', desc: 'Exclude files from Claude\'s context (like .gitignore)' },
        { key: 'Pipe input', desc: 'cat file.txt | claude "explain this code"' },
        { key: 'Headless mode', desc: 'claude -p "query" for scripting/automation' },
        { key: 'Custom prompts', desc: 'Create ~/.claude/commands/ for custom slash commands' },
        { key: 'Hooks', desc: 'Run scripts on events: PreToolUse, PostToolUse, etc.' },
        { key: 'MCP Servers', desc: 'Extend Claude with external tools via MCP protocol' },
        { key: 'Context window', desc: 'Use /compact when context gets large' },
        { key: 'Cost tracking', desc: 'Use /cost regularly to monitor API usage' },
      ]
    },
    workflows: {
      title: 'Common Workflows',
      items: [
        { key: 'Code Review', desc: 'git diff | claude "review these changes"' },
        { key: 'Debugging', desc: 'Paste error + "help me fix this"' },
        { key: 'Refactoring', desc: '"refactor @src/old.js to use async/await"' },
        { key: 'Testing', desc: '"write tests for @src/utils.js"' },
        { key: 'Documentation', desc: '"add JSDoc comments to @src/api.js"' },
        { key: 'Git commits', desc: '"commit these changes with a good message"' },
        { key: 'PR creation', desc: '"create a PR for this branch"' },
        { key: 'Explain code', desc: '"explain how @src/auth.js works"' },
        { key: 'Find bugs', desc: '"find potential bugs in @src/handler.js"' },
        { key: 'Optimization', desc: '"optimize the performance of this function"' },
      ]
    }
  }

  return (
    <div className="faq">
      <div className="faq-nav">
        {Object.entries(sections).map(([key, section]) => (
          <button
            key={key}
            className={`faq-nav-btn ${activeSection === key ? 'active' : ''}`}
            onClick={() => setActiveSection(key)}
          >
            {section.title}
          </button>
        ))}
      </div>

      <div className="faq-content">
        <h2>{sections[activeSection].title}</h2>
        <div className="faq-grid">
          {sections[activeSection].items.map((item, i) => (
            <div key={i} className="faq-item">
              <code className="faq-key">{item.key}</code>
              <span className="faq-desc">{item.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MCPTab() {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('popular')
  const [copiedId, setCopiedId] = useState(null)
  const [mcpServers, setMcpServers] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [fetchedAt, setFetchedAt] = useState(null)

  useEffect(() => {
    fetchMCPServers()
  }, [])

  async function fetchMCPServers(forceRefresh = false) {
    try {
      if (forceRefresh) setRefreshing(true)
      const url = forceRefresh ? `${API_BASE}/mcp?refresh=1` : `${API_BASE}/mcp`
      const res = await fetch(url)
      const data = await res.json()
      setMcpServers(data.servers || [])
      setFetchedAt(data.fetchedAt)
    } catch (error) {
      console.error('Failed to fetch MCP servers:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Generate config JSON for a server
  function generateConfig(mcp) {
    const name = mcp.id.replace(/[^a-z0-9]/gi, '-').toLowerCase()
    if (mcp.install && mcp.install.startsWith('npx')) {
      const pkg = mcp.install.replace('npx -y ', '').replace('npx ', '')
      return `"${name}": {\n  "command": "npx",\n  "args": ["-y", "${pkg}"]\n}`
    }
    return `"${name}": {\n  "command": "node",\n  "args": ["path/to/server"]\n}`
  }

  const categories = [
    { id: 'all', name: 'All' },
    { id: 'core', name: 'Core' },
    { id: 'dev', name: 'Dev' },
    { id: 'database', name: 'Database' },
    { id: 'web', name: 'Web' },
    { id: 'communication', name: 'Comms' },
    { id: 'productivity', name: 'Productivity' },
    { id: 'cloud', name: 'Cloud' },
    { id: 'other', name: 'Other' },
  ]

  const sortOptions = [
    { id: 'popular', name: 'Popular' },
    { id: 'stars', name: 'Stars' },
    { id: 'name', name: 'Name A-Z' },
    { id: 'recent', name: 'Recent' },
  ]

  // Filter by category
  let results = filter === 'all'
    ? mcpServers
    : mcpServers.filter(m => m.category === filter)

  // Filter by search
  if (search.trim()) {
    const q = search.toLowerCase()
    results = results.filter(m =>
      m.name?.toLowerCase().includes(q) ||
      m.description?.toLowerCase().includes(q) ||
      m.author?.toLowerCase().includes(q) ||
      m.id?.toLowerCase().includes(q)
    )
  }

  // Sort results
  results = [...results].sort((a, b) => {
    switch (sortBy) {
      case 'stars':
        return (b.stars || 0) - (a.stars || 0)
      case 'name':
        return (a.name || '').localeCompare(b.name || '')
      case 'recent':
        return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
      case 'popular':
      default:
        const aScore = (a.stars || 0) + (a.useCount || 0) * 10
        const bScore = (b.stars || 0) + (b.useCount || 0) * 10
        return bScore - aScore
    }
  })

  const copyConfig = (id, config) => {
    navigator.clipboard.writeText(config)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const copyInstall = (install) => {
    navigator.clipboard.writeText(install)
  }

  const formatStars = (stars) => {
    if (!stars) return null
    if (stars >= 1000) return `${(stars / 1000).toFixed(1)}k`
    return stars
  }

  if (loading) {
    return (
      <div className="mcp">
        <div className="mcp-loading">Fetching MCP servers from GitHub & Smithery...</div>
      </div>
    )
  }

  return (
    <div className="mcp">
      <div className="mcp-header">
        <div className="mcp-intro">
          <p>MCP (Model Context Protocol) servers extend Claude's capabilities with external tools.</p>
          <p className="mcp-config-path">Config: <code>~/.claude/claude_desktop_config.json</code></p>
          {fetchedAt && (
            <p className="mcp-fetched">
              Live data from GitHub + Smithery • {mcpServers.length} servers • Updated {new Date(fetchedAt).toLocaleTimeString()}
              <button
                className={`mcp-refresh-btn ${refreshing ? 'refreshing' : ''}`}
                onClick={() => fetchMCPServers(true)}
                disabled={refreshing}
              >
                {refreshing ? '↻ Refreshing...' : '↻ Refresh'}
              </button>
            </p>
          )}
        </div>

        <div className="mcp-controls">
          <div className="mcp-search">
            <input
              type="text"
              placeholder="Search servers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="mcp-search-clear" onClick={() => setSearch('')}>×</button>
            )}
          </div>

          <div className="mcp-sort">
            <span className="sort-label">Sort:</span>
            {sortOptions.map(opt => (
              <button
                key={opt.id}
                className={`mcp-sort-btn ${sortBy === opt.id ? 'active' : ''}`}
                onClick={() => setSortBy(opt.id)}
              >
                {opt.name}
              </button>
            ))}
          </div>
        </div>

        <div className="mcp-filters">
          {categories.map(cat => (
            <button
              key={cat.id}
              className={`mcp-filter-btn ${filter === cat.id ? 'active' : ''}`}
              onClick={() => setFilter(cat.id)}
            >
              {cat.name}
              {cat.id !== 'all' && (
                <span className="filter-count">
                  {mcpServers.filter(m => m.category === cat.id).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mcp-results-info">
        Showing {results.length} of {mcpServers.length} servers
        {search && <span> matching "{search}"</span>}
        {filter !== 'all' && <span> in {filter}</span>}
      </div>

      <div className="mcp-grid">
        {results.map(mcp => (
          <div key={mcp.id} className="mcp-card">
            <div className="mcp-card-header">
              <h3>{mcp.name}</h3>
              <div className="mcp-stats">
                {mcp.stars && <span className="mcp-stars">★ {formatStars(mcp.stars)}</span>}
                {mcp.useCount > 0 && <span className="mcp-uses">{mcp.useCount} uses</span>}
              </div>
            </div>
            <p className="mcp-desc">{mcp.description || 'No description available'}</p>
            <div className="mcp-meta">
              <span className="mcp-author">by {mcp.author}</span>
              <div className="mcp-badges">
                <span className={`mcp-category ${mcp.category}`}>{mcp.category}</span>
                <span className={`mcp-source ${mcp.source}`}>{mcp.source}</span>
              </div>
            </div>
            {mcp.install && (
              <div className="mcp-install" onClick={() => copyInstall(mcp.install)} title="Click to copy">
                <code>{mcp.install}</code>
              </div>
            )}
            <div className="mcp-actions">
              <button
                className={`mcp-copy-btn ${copiedId === mcp.id ? 'copied' : ''}`}
                onClick={() => copyConfig(mcp.id, generateConfig(mcp))}
              >
                {copiedId === mcp.id ? '✓ Copied!' : 'Copy Config'}
              </button>
              {mcp.homepage && (
                <a href={mcp.homepage} target="_blank" rel="noopener noreferrer" className="mcp-link-btn">
                  View →
                </a>
              )}
            </div>
            <details className="mcp-config-details">
              <summary>View Config</summary>
              <pre className="mcp-config">{generateConfig(mcp)}</pre>
            </details>
          </div>
        ))}
      </div>

      {results.length === 0 && (
        <div className="mcp-empty">
          {search ? `No servers found matching "${search}"` : 'No servers found in this category'}
        </div>
      )}
    </div>
  )
}

function ProductivityTab() {
  const [activeSection, setActiveSection] = useState('velocity')
  const [productivity, setProductivity] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchProductivity()
  }, [])

  async function fetchProductivity(forceRefresh = false) {
    try {
      if (forceRefresh) setRefreshing(true)
      const url = forceRefresh ? `${API_BASE}/productivity?refresh=1` : `${API_BASE}/productivity`
      const res = await fetch(url)
      const data = await res.json()
      setProductivity(data)
    } catch (error) {
      console.error('Failed to fetch productivity:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const formatNumber = (num) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
    return num?.toString() || '0'
  }

  if (loading) {
    return (
      <div className="productivity">
        <div className="productivity-loading">Loading productivity metrics...</div>
      </div>
    )
  }

  // Check for empty state
  if (productivity?.message) {
    return (
      <div className="productivity">
        <div className="productivity-empty">
          <h2>Productivity Analytics</h2>
          <p>{productivity.message}</p>
        </div>
      </div>
    )
  }

  const { velocity, efficiency, patterns, toolUsage, summary } = productivity || {}

  return (
    <div className="productivity">
      <div className="productivity-header">
        <div className="productivity-nav">
          {['velocity', 'efficiency', 'patterns', 'tools'].map(section => (
            <button
              key={section}
              className={`productivity-nav-btn ${activeSection === section ? 'active' : ''}`}
              onClick={() => setActiveSection(section)}
            >
              {section}
            </button>
          ))}
        </div>
        <button
          className={`productivity-refresh-btn ${refreshing ? 'refreshing' : ''}`}
          onClick={() => fetchProductivity(true)}
          disabled={refreshing}
        >
          {refreshing ? '↻ Refreshing...' : '↻ Refresh'}
        </button>
      </div>

      {/* Summary bar */}
      <div className="productivity-summary">
        <span className="summary-item">
          <span className="summary-label">Active Days:</span>
          <span className="summary-value">{summary?.totalActiveDays || 0}</span>
        </span>
        <span className="summary-item">
          <span className="summary-label">Best Day:</span>
          <span className="summary-value">{summary?.mostProductiveDay || 'N/A'}</span>
        </span>
        <span className="summary-item">
          <span className="summary-label">Peak Hour:</span>
          <span className="summary-value">{summary?.mostProductiveHour || 'N/A'}</span>
        </span>
        <span className="summary-item">
          <span className="summary-label">Current Streak:</span>
          <span className="summary-value streak">{patterns?.currentStreak || 0} days</span>
        </span>
      </div>

      {/* Velocity Section */}
      {activeSection === 'velocity' && (
        <div className="productivity-section">
          <h2>Coding Velocity</h2>

          <div className="velocity-stats">
            <div className="velocity-stat">
              <span className="velocity-value">{velocity?.totalCodeOperations || 0}</span>
              <span className="velocity-label">Total Code Ops</span>
            </div>
            <div className="velocity-stat">
              <span className="velocity-value">{velocity?.totalWrites || 0}</span>
              <span className="velocity-label">Files Written</span>
            </div>
            <div className="velocity-stat">
              <span className="velocity-value">{velocity?.totalEdits || 0}</span>
              <span className="velocity-label">Edits Made</span>
            </div>
            <div className="velocity-stat">
              <span className="velocity-value">{formatNumber(velocity?.linesChangedEstimate || 0)}</span>
              <span className="velocity-label">Lines Changed</span>
            </div>
            <div className="velocity-stat highlight">
              <span className="velocity-value">{velocity?.averageOpsPerDay || 0}</span>
              <span className="velocity-label">Avg Ops/Day</span>
            </div>
          </div>

          {/* Operations Trend Chart */}
          {velocity?.operationsTrend?.length > 0 && (
            <div className="chart-container">
              <h3>Operations Trend (Last 14 Days)</h3>
              <div className="velocity-chart">
                <div className="velocity-chart-bars">
                  {velocity.operationsTrend.map((day, i) => {
                    const maxOps = Math.max(...velocity.operationsTrend.map(d => d.total), 1)
                    const writeHeight = (day.writes / maxOps) * 100
                    const editHeight = (day.edits / maxOps) * 100
                    return (
                      <div key={i} className="velocity-bar-group" title={`${day.date}: ${day.writes} writes, ${day.edits} edits`}>
                        <div className="velocity-bar-stack">
                          <div className="velocity-bar writes" style={{ height: `${writeHeight}%` }} />
                          <div className="velocity-bar edits" style={{ height: `${editHeight}%` }} />
                        </div>
                        <span className="velocity-bar-label">{day.date.slice(5)}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="velocity-chart-legend">
                  <span className="legend-item writes">Writes</span>
                  <span className="legend-item edits">Edits</span>
                </div>
              </div>
            </div>
          )}

          {/* Files Modified Chart */}
          {velocity?.filesModifiedByDay?.length > 0 && (
            <div className="chart-container">
              <h3>Files Modified Per Day</h3>
              <div className="files-chart">
                {velocity.filesModifiedByDay.slice(-14).map((day, i) => {
                  const maxFiles = Math.max(...velocity.filesModifiedByDay.slice(-14).map(d => d.count), 1)
                  return (
                    <div key={i} className="files-bar-group">
                      <div
                        className="files-bar"
                        style={{ width: `${(day.count / maxFiles) * 100}%` }}
                        title={`${day.count} files`}
                      >
                        <span className="files-bar-value">{day.count}</span>
                      </div>
                      <span className="files-bar-label">{day.date.slice(5)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Efficiency Section */}
      {activeSection === 'efficiency' && (
        <div className="productivity-section">
          <h2>Efficiency Analysis</h2>

          <div className="efficiency-stats">
            <div className="efficiency-stat">
              <span className="efficiency-value">{efficiency?.opsPerSession || 0}</span>
              <span className="efficiency-label">Ops per Session</span>
            </div>
            <div className="efficiency-stat">
              <span className="efficiency-value">{formatNumber(efficiency?.tokensPerCodeOp || 0)}</span>
              <span className="efficiency-label">Tokens per Code Op</span>
            </div>
            <div className="efficiency-stat">
              <span className="efficiency-value">{formatNumber(efficiency?.totalTokens || 0)}</span>
              <span className="efficiency-label">Total Tokens</span>
            </div>
          </div>

          {/* Peak Hours Heatmap */}
          <div className="chart-container">
            <h3>Peak Activity Hours</h3>
            <div className="heatmap-container">
              <div className="heatmap-hours">
                {[0, 6, 12, 18, 23].map(h => (
                  <span key={h} className="heatmap-hour-label">{h}:00</span>
                ))}
              </div>
              <div className="heatmap">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, dayIndex) => (
                  <div key={day} className="heatmap-row">
                    <span className="heatmap-day">{day}</span>
                    <div className="heatmap-cells">
                      {(efficiency?.peakHoursHeatmap?.[dayIndex] || Array(24).fill(0)).map((count, hour) => {
                        const maxCount = Math.max(...(efficiency?.peakHoursHeatmap?.flat() || [0]), 1)
                        const intensity = count / maxCount
                        return (
                          <div
                            key={hour}
                            className="heatmap-cell"
                            style={{
                              backgroundColor: count > 0
                                ? `rgba(107, 179, 240, ${0.2 + intensity * 0.8})`
                                : 'var(--bg-tertiary)'
                            }}
                            title={`${day} ${hour}:00 - ${count} operations`}
                          />
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Session Duration Distribution */}
          <div className="chart-container">
            <h3>Session Duration Distribution</h3>
            <div className="duration-chart">
              {Object.entries(efficiency?.sessionDurations || {}).map(([bucket, count]) => {
                const maxCount = Math.max(...Object.values(efficiency?.sessionDurations || {}), 1)
                const labels = {
                  '0-15': '< 15 min',
                  '15-30': '15-30 min',
                  '30-60': '30-60 min',
                  '60+': '> 60 min'
                }
                return (
                  <div key={bucket} className="duration-bar-group">
                    <span className="duration-label">{labels[bucket]}</span>
                    <div className="duration-bar-container">
                      <div
                        className="duration-bar"
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      />
                      <span className="duration-count">{count}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Patterns Section */}
      {activeSection === 'patterns' && (
        <div className="productivity-section">
          <h2>Work Patterns</h2>

          <div className="patterns-stats">
            <div className="streak-card current">
              <span className="streak-value">{patterns?.currentStreak || 0}</span>
              <span className="streak-label">Current Streak</span>
              <span className="streak-unit">consecutive days</span>
            </div>
            <div className="streak-card longest">
              <span className="streak-value">{patterns?.longestStreak || 0}</span>
              <span className="streak-label">Longest Streak</span>
              <span className="streak-unit">days</span>
            </div>
            <div className="streak-card focus">
              <span className="streak-value">{patterns?.focusSessions || 0}</span>
              <span className="streak-label">Focus Sessions</span>
              <span className="streak-unit">&gt;30 min sustained</span>
            </div>
          </div>

          {/* Productivity by Day of Week */}
          <div className="chart-container">
            <h3>Productivity by Day of Week</h3>
            <div className="dayofweek-chart">
              {(patterns?.productivityByDayOfWeek || []).map((day, i) => {
                const maxTotal = Math.max(...(patterns?.productivityByDayOfWeek || []).map(d => d.total), 1)
                return (
                  <div key={i} className="dayofweek-bar-group">
                    <span className="dayofweek-label">{day.day}</span>
                    <div className="dayofweek-bar-container">
                      <div
                        className="dayofweek-bar"
                        style={{ height: `${(day.total / maxTotal) * 100}%` }}
                        title={`${day.total} total operations`}
                      />
                    </div>
                    <span className="dayofweek-value">{day.total}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Most Edited Files */}
          {patterns?.mostEditedFiles?.length > 0 && (
            <div className="chart-container">
              <h3>Hot Spots (Most Edited Files)</h3>
              <div className="hotspots-list">
                {patterns.mostEditedFiles.map((file, i) => {
                  const maxCount = patterns.mostEditedFiles[0]?.count || 1
                  return (
                    <div key={i} className="hotspot-item">
                      <span className="hotspot-rank">#{i + 1}</span>
                      <div className="hotspot-info">
                        <span className="hotspot-name">{file.name}</span>
                        <span className="hotspot-path">{file.path}</span>
                      </div>
                      <div className="hotspot-bar-container">
                        <div
                          className="hotspot-bar"
                          style={{ width: `${(file.count / maxCount) * 100}%` }}
                        />
                      </div>
                      <span className="hotspot-count">{file.count}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tools Section */}
      {activeSection === 'tools' && (
        <div className="productivity-section">
          <h2>Tool Usage</h2>

          {/* Read:Write Ratio Highlight */}
          <div className="ratio-highlight">
            <div className="ratio-value">
              <span className="ratio-number">{toolUsage?.readWriteRatio || 0}</span>
              <span className="ratio-label">Read : Write Ratio</span>
            </div>
            <div className="ratio-insight">{toolUsage?.ratioInsight || ''}</div>
          </div>

          {/* Tool Distribution */}
          <div className="chart-container">
            <h3>Tool Distribution</h3>
            <div className="tool-distribution">
              {Object.entries(toolUsage?.distribution || {}).map(([tool, count]) => {
                const total = Object.values(toolUsage?.distribution || {}).reduce((a, b) => a + b, 0) || 1
                const percentage = ((count / total) * 100).toFixed(1)
                const maxCount = Math.max(...Object.values(toolUsage?.distribution || {}), 1)
                const toolColors = {
                  Write: 'var(--accent-green)',
                  Edit: 'var(--accent-orange)',
                  Read: 'var(--accent-blue)',
                  Bash: 'var(--accent-purple)',
                  Glob: 'var(--accent-cyan)',
                  Grep: 'var(--accent-red)'
                }
                return (
                  <div key={tool} className="tool-bar-group">
                    <span className="tool-name">{tool}</span>
                    <div className="tool-bar-container">
                      <div
                        className="tool-bar"
                        style={{
                          width: `${(count / maxCount) * 100}%`,
                          backgroundColor: toolColors[tool] || 'var(--accent-blue)'
                        }}
                      />
                    </div>
                    <span className="tool-count">{formatNumber(count)}</span>
                    <span className="tool-percentage">{percentage}%</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Tool Usage Trends */}
          {toolUsage?.trends?.length > 0 && (
            <div className="chart-container">
              <h3>Tool Usage Trends (Last 14 Days)</h3>
              <div className="tool-trends">
                <div className="tool-trends-header">
                  <span className="trend-date-header">Date</span>
                  {['Write', 'Edit', 'Read', 'Bash'].map(tool => (
                    <span key={tool} className={`trend-tool-header ${tool.toLowerCase()}`}>{tool}</span>
                  ))}
                </div>
                {toolUsage.trends.map((day, i) => (
                  <div key={i} className="tool-trend-row">
                    <span className="trend-date">{day.date.slice(5)}</span>
                    <span className="trend-value write">{day.Write || 0}</span>
                    <span className="trend-value edit">{day.Edit || 0}</span>
                    <span className="trend-value read">{day.Read || 0}</span>
                    <span className="trend-value bash">{day.Bash || 0}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default App
