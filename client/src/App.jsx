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
              className={activeTab === 'insights' ? 'active' : ''}
              onClick={() => setActiveTab('insights')}
            >
              insights
            </button>
            <button
              className={activeTab === 'agents' ? 'active' : ''}
              onClick={() => setActiveTab('agents')}
            >
              agents
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
        {activeTab === 'insights' && (
          <InsightsTab />
        )}
        {activeTab === 'agents' && (
          <AgentsTab />
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

function InsightsTab() {
  const [activeSection, setActiveSection] = useState('today')
  const [dailyData, setDailyData] = useState(null)
  const [errorsData, setErrorsData] = useState(null)
  const [tasksData, setTasksData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [currentDate, setCurrentDate] = useState(null)

  useEffect(() => {
    fetchDaily()
    fetchErrors()
    fetchTasks()
  }, [])

  async function fetchDaily(date = null, forceRefresh = false) {
    try {
      if (forceRefresh) setRefreshing(true)
      const dateParam = date ? `&date=${date}` : ''
      const refreshParam = forceRefresh ? '?refresh=1' : '?'
      const res = await fetch(`${API_BASE}/insights/daily${refreshParam}${dateParam}`)
      const data = await res.json()
      setDailyData(data)
      setCurrentDate(data.date)
    } catch (error) {
      console.error('Failed to fetch daily insights:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function fetchErrors(forceRefresh = false) {
    try {
      const url = forceRefresh ? `${API_BASE}/insights/errors?refresh=1` : `${API_BASE}/insights/errors`
      const res = await fetch(url)
      const data = await res.json()
      setErrorsData(data)
    } catch (error) {
      console.error('Failed to fetch error patterns:', error)
    }
  }

  async function fetchTasks(forceRefresh = false) {
    try {
      const url = forceRefresh ? `${API_BASE}/insights/tasks?refresh=1` : `${API_BASE}/insights/tasks`
      const res = await fetch(url)
      const data = await res.json()
      setTasksData(data)
    } catch (error) {
      console.error('Failed to fetch tasks:', error)
    }
  }

  const handleRefresh = () => {
    if (activeSection === 'today') fetchDaily(currentDate, true)
    else if (activeSection === 'errors') fetchErrors(true)
    else if (activeSection === 'tasks') fetchTasks(true)
  }

  const navigateDate = (direction) => {
    if (!dailyData?.navigation) return
    const targetDate = direction === 'prev'
      ? dailyData.navigation.previousDate
      : dailyData.navigation.nextDate
    if (targetDate) fetchDaily(targetDate)
  }

  const formatMinutes = (mins) => {
    if (mins < 60) return `${mins} min`
    const hours = Math.floor(mins / 60)
    const remaining = mins % 60
    return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`
  }

  if (loading) {
    return (
      <div className="insights">
        <div className="insights-loading">Loading insights...</div>
      </div>
    )
  }

  return (
    <div className="insights">
      <div className="insights-header">
        <div className="insights-nav">
          {[
            { id: 'today', label: 'today' },
            { id: 'errors', label: 'errors' },
            { id: 'tasks', label: 'tasks' }
          ].map(section => (
            <button
              key={section.id}
              className={`insights-nav-btn ${activeSection === section.id ? 'active' : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </div>
        <button
          className={`insights-refresh-btn ${refreshing ? 'refreshing' : ''}`}
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Daily Summary Section */}
      {activeSection === 'today' && (
        <div className="insights-section">
          <div className="daily-header">
            <button
              className="date-nav-btn"
              onClick={() => navigateDate('prev')}
              disabled={!dailyData?.navigation?.hasPrevious}
            >
              prev
            </button>
            <h2 className="daily-date">{dailyData?.displayDate || 'Today'}</h2>
            <button
              className="date-nav-btn"
              onClick={() => navigateDate('next')}
              disabled={!dailyData?.navigation?.hasNext}
            >
              next
            </button>
          </div>

          {dailyData?.summary?.sessionCount === 0 ? (
            <div className="insights-empty">
              <p>No activity recorded for this day.</p>
              {dailyData?.navigation?.hasPrevious && (
                <button className="nav-hint-btn" onClick={() => navigateDate('prev')}>
                  View previous day with activity
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="summary-tree">
                <div className="tree-item">
                  <span className="tree-branch">|--</span>
                  <span className="tree-label">{dailyData?.summary?.sessionCount || 0} sessions</span>
                  <span className="tree-value">{formatMinutes(dailyData?.summary?.activeMinutes || 0)} active</span>
                </div>
                <div className="tree-item">
                  <span className="tree-branch">|--</span>
                  <span className="tree-label">Files touched:</span>
                  <span className="tree-value files">
                    {dailyData?.summary?.filesModified?.slice(0, 5).join(', ') || 'none'}
                    {(dailyData?.summary?.filesModified?.length || 0) > 5 && ` +${dailyData.summary.filesModified.length - 5} more`}
                  </span>
                </div>
                <div className="tree-item">
                  <span className="tree-branch">|--</span>
                  <span className="tree-label">{dailyData?.summary?.operationCounts?.total || 0} code operations</span>
                  <span className="tree-value ops">
                    ({dailyData?.summary?.operationCounts?.writes || 0} writes, {dailyData?.summary?.operationCounts?.edits || 0} edits)
                  </span>
                </div>
                <div className="tree-item last">
                  <span className="tree-branch">`--</span>
                  <span className="tree-label">Topics worked on:</span>
                </div>
              </div>

              <div className="topics-list">
                {(dailyData?.summary?.topics || []).length === 0 ? (
                  <div className="topic-item empty">No topics detected</div>
                ) : (
                  dailyData.summary.topics.map((topic, i) => (
                    <div key={i} className="topic-item">
                      <span className="topic-bullet">*</span>
                      <span className="topic-name">{topic.topic}</span>
                      <span className="topic-stats">
                        {topic.operationCount} ops, {topic.filesInvolved?.length || 0} files
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Error Patterns Section */}
      {activeSection === 'errors' && (
        <div className="insights-section">
          <h2 className="section-title">Error Patterns ({errorsData?.period || 'Last 7 days'})</h2>
          <p className="section-subtitle">Inferred patterns from your coding sessions</p>

          {/* Struggle Files */}
          <div className="pattern-group">
            <h3 className="pattern-title">Struggle Files (5+ edits in one session)</h3>
            {(errorsData?.patterns?.struggleFiles || []).length === 0 ? (
              <div className="pattern-empty">No struggle files detected</div>
            ) : (
              <div className="struggle-files">
                {errorsData.patterns.struggleFiles.map((file, i) => (
                  <div key={i} className={`struggle-file severity-${file.severity}`}>
                    <span className="struggle-name">{file.fileName}</span>
                    <span className="struggle-count">{file.editCount} edits</span>
                    <span className="struggle-date">{file.date}</span>
                    <span className={`struggle-badge ${file.severity}`}>{file.severity}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Repeated Commands */}
          <div className="pattern-group">
            <h3 className="pattern-title">Repeated Commands (3+ times in succession)</h3>
            {(errorsData?.patterns?.repeatedCommands || []).length === 0 ? (
              <div className="pattern-empty">No repeated commands detected</div>
            ) : (
              <div className="repeated-commands">
                {errorsData.patterns.repeatedCommands.map((cmd, i) => (
                  <div key={i} className="repeated-cmd">
                    <code className="cmd-name">{cmd.command}</code>
                    <span className="cmd-note">{cmd.note}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Error Mentions */}
          <div className="pattern-group">
            <h3 className="pattern-title">Error-Related Keywords in Prompts</h3>
            {(errorsData?.patterns?.errorMentions || []).length === 0 ? (
              <div className="pattern-empty">No error keywords detected</div>
            ) : (
              <div className="error-mentions">
                {errorsData.patterns.errorMentions.map((mention, i) => (
                  <div key={i} className="error-mention">
                    <span className="mention-keyword">"{mention.keyword}"</span>
                    <span className="mention-count">{mention.count}x</span>
                    {mention.samplePrompts?.length > 0 && (
                      <span className="mention-sample" title={mention.samplePrompts.join('\n')}>
                        e.g. "{mention.samplePrompts[0]?.substring(0, 40)}..."
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Thrashing Sessions */}
          <div className="pattern-group">
            <h3 className="pattern-title">Thrashing Sessions (many ops, few files, short time)</h3>
            {(errorsData?.patterns?.thrashingSessions || []).length === 0 ? (
              <div className="pattern-empty">No thrashing sessions detected</div>
            ) : (
              <div className="thrashing-sessions">
                {errorsData.patterns.thrashingSessions.map((session, i) => (
                  <div key={i} className="thrash-session">
                    <span className="thrash-ops">{session.operationCount} ops</span>
                    <span className="thrash-files">{session.uniqueFilesCount} files</span>
                    <span className="thrash-duration">{session.duration} min</span>
                    <span className="thrash-date">{session.date}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Time-on-Task Section */}
      {activeSection === 'tasks' && (
        <div className="insights-section">
          <h2 className="section-title">Time on Task ({tasksData?.period || 'Last 30 days'})</h2>

          {/* Summary Bar */}
          <div className="tasks-summary">
            <div className="tasks-summary-item">
              <span className="summary-num">{tasksData?.summary?.totalTasks || 0}</span>
              <span className="summary-label">tasks</span>
            </div>
            <div className="tasks-summary-item">
              <span className="summary-num">{formatMinutes(tasksData?.summary?.totalTimeMinutes || 0)}</span>
              <span className="summary-label">total time</span>
            </div>
            <div className="tasks-summary-item">
              <span className="summary-num">{formatMinutes(tasksData?.summary?.avgMinutesPerTask || 0)}</span>
              <span className="summary-label">avg per task</span>
            </div>
          </div>

          {/* Task Cards */}
          {(tasksData?.tasks || []).length === 0 ? (
            <div className="insights-empty">
              <p>No tasks detected yet.</p>
              <p className="empty-hint">Tasks are grouped from related sessions automatically.</p>
            </div>
          ) : (
            <div className="tasks-list">
              {tasksData.tasks.map((task, i) => (
                <div key={task.id} className="task-card">
                  <div className="task-header">
                    <span className="task-name">{task.name}</span>
                    <span className={`task-inferred ${task.inferredFrom}`}>
                      {task.inferredFrom === 'prompt' ? 'from prompt' : task.inferredFrom === 'file' ? 'from file' : 'inferred'}
                    </span>
                  </div>
                  <div className="task-meta">
                    <span className="task-sessions">{task.sessionCount} session{task.sessionCount !== 1 ? 's' : ''}</span>
                    <span className="task-time">{formatMinutes(task.totalMinutes)}</span>
                    <span className="task-dates">
                      {task.dateRange?.start === task.dateRange?.end
                        ? task.dateRange.start
                        : `${task.dateRange?.start} - ${task.dateRange?.end}`}
                    </span>
                  </div>
                  <div className="task-files">
                    {task.filesInvolved?.slice(0, 5).map((file, j) => (
                      <span key={j} className="task-file">{file}</span>
                    ))}
                    {(task.filesInvolved?.length || 0) > 5 && (
                      <span className="task-file-more">+{task.filesInvolved.length - 5}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AgentsTab() {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('stars')
  const [copiedId, setCopiedId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [fetchedAt, setFetchedAt] = useState(null)

  useEffect(() => {
    fetchAgents()
  }, [])

  async function fetchAgents(forceRefresh = false) {
    try {
      if (forceRefresh) setRefreshing(true)
      const url = forceRefresh ? `${API_BASE}/agents?refresh=1` : `${API_BASE}/agents`
      const res = await fetch(url)
      const data = await res.json()
      setAgents(data.agents || [])
      setFetchedAt(data.fetchedAt)
    } catch (error) {
      console.error('Failed to fetch agents:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const categories = [
    { id: 'all', name: 'All' },
    { id: 'frontend', name: 'Frontend' },
    { id: 'backend', name: 'Backend' },
    { id: 'typescript', name: 'TypeScript' },
    { id: 'python', name: 'Python' },
    { id: 'rust', name: 'Rust' },
    { id: 'go', name: 'Go' },
    { id: 'devops', name: 'DevOps' },
    { id: 'cli', name: 'CLI' },
    { id: 'general', name: 'General' },
  ]

  const sortOptions = [
    { id: 'stars', name: 'Stars' },
    { id: 'recent', name: 'Recent' },
    { id: 'name', name: 'Name A-Z' },
  ]

  // Filter by category
  let results = filter === 'all'
    ? agents
    : agents.filter(a => a.category === filter)

  // Filter by search
  if (search.trim()) {
    const q = search.toLowerCase()
    results = results.filter(a =>
      a.name?.toLowerCase().includes(q) ||
      a.description?.toLowerCase().includes(q) ||
      a.author?.toLowerCase().includes(q) ||
      a.preview?.toLowerCase().includes(q) ||
      a.topics?.some(t => t.toLowerCase().includes(q))
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
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
      default:
        return 0
    }
  })

  const copyContent = (id, content) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const formatStars = (stars) => {
    if (!stars) return '0'
    if (stars >= 1000) return `${(stars / 1000).toFixed(1)}k`
    return stars.toString()
  }

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id)
  }

  if (loading) {
    return (
      <div className="agents">
        <div className="agents-loading">Fetching trending CLAUDE.md files from GitHub...</div>
      </div>
    )
  }

  return (
    <div className="agents">
      <div className="agents-header">
        <div className="agents-intro">
          <p>Discover trending CLAUDE.md project instruction files from the community.</p>
          <p className="agents-config-path">Add to your project: <code>CLAUDE.md</code> in project root</p>
          {fetchedAt && (
            <p className="agents-fetched">
              Live from GitHub {agents.length} configs found Updated {new Date(fetchedAt).toLocaleTimeString()}
              <button
                className={`agents-refresh-btn ${refreshing ? 'refreshing' : ''}`}
                onClick={() => fetchAgents(true)}
                disabled={refreshing}
              >
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </p>
          )}
        </div>

        <div className="agents-controls">
          <div className="agents-search">
            <input
              type="text"
              placeholder="Search configs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="agents-search-clear" onClick={() => setSearch('')}>x</button>
            )}
          </div>

          <div className="agents-sort">
            <span className="sort-label">Sort:</span>
            {sortOptions.map(opt => (
              <button
                key={opt.id}
                className={`agents-sort-btn ${sortBy === opt.id ? 'active' : ''}`}
                onClick={() => setSortBy(opt.id)}
              >
                {opt.name}
              </button>
            ))}
          </div>
        </div>

        <div className="agents-filters">
          {categories.map(cat => (
            <button
              key={cat.id}
              className={`agents-filter-btn ${filter === cat.id ? 'active' : ''}`}
              onClick={() => setFilter(cat.id)}
            >
              {cat.name}
              {cat.id !== 'all' && (
                <span className="filter-count">
                  {agents.filter(a => a.category === cat.id).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="agents-results-info">
        Showing {results.length} of {agents.length} configs
        {search && <span> matching "{search}"</span>}
        {filter !== 'all' && <span> in {filter}</span>}
      </div>

      <div className="agents-grid">
        {results.map(agent => (
          <div key={agent.id} className="agents-card">
            <div className="agents-card-header">
              <h3>{agent.name}</h3>
              <div className="agents-stats">
                <span className="agents-stars">{formatStars(agent.stars)}</span>
              </div>
            </div>
            <p className="agents-desc">{agent.description || 'No description available'}</p>

            <div className="agents-meta">
              <span className="agents-author">by {agent.author}</span>
              <div className="agents-badges">
                <span className={`agents-category ${agent.category}`}>{agent.category}</span>
                {agent.language && (
                  <span className="agents-language">{agent.language}</span>
                )}
              </div>
            </div>

            {agent.topics?.length > 0 && (
              <div className="agents-topics">
                {agent.topics.slice(0, 5).map((topic, i) => (
                  <span key={i} className="agents-topic">{topic}</span>
                ))}
              </div>
            )}

            <div className="agents-preview">
              <div className="preview-header" onClick={() => toggleExpand(agent.id)}>
                <span className="preview-label">CLAUDE.md Preview</span>
                <span className="preview-toggle">{expandedId === agent.id ? '[-]' : '[+]'}</span>
              </div>
              <pre className={`preview-content ${expandedId === agent.id ? 'expanded' : ''}`}>
                {expandedId === agent.id ? agent.content : agent.preview}
              </pre>
            </div>

            <div className="agents-actions">
              <button
                className={`agents-copy-btn ${copiedId === agent.id ? 'copied' : ''}`}
                onClick={() => copyContent(agent.id, agent.content)}
              >
                {copiedId === agent.id ? 'Copied!' : 'Copy CLAUDE.md'}
              </button>
              <a href={agent.claudeUrl} target="_blank" rel="noopener noreferrer" className="agents-link-btn">
                View on GitHub
              </a>
            </div>
          </div>
        ))}
      </div>

      {results.length === 0 && (
        <div className="agents-empty">
          {search ? `No configs found matching "${search}"` : 'No configs found in this category'}
        </div>
      )}
    </div>
  )
}

function ResearchTab({ projects }) {
  const [query, setQuery] = useState('')
  const [selectedProject, setSelectedProject] = useState('')
  const [maxSearches, setMaxSearches] = useState(5)
  const [isResearching, setIsResearching] = useState(false)
  const [currentTask, setCurrentTask] = useState(null)
  const [taskStatus, setTaskStatus] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [events, setEvents] = useState([])

  // Set default project when projects load
  useEffect(() => {
    if (projects.length > 0 && !selectedProject) {
      setSelectedProject(projects[0].path)
    }
  }, [projects])

  const startResearch = async () => {
    if (!query.trim() || !selectedProject) {
      setError('Please enter a research query and select a project')
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
          target_project: selectedProject,
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
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
            >
              <option value="">Select a project...</option>
              {projects.map(project => (
                <option key={project.id} value={project.path}>
                  {project.name} ({project.path})
                </option>
              ))}
            </select>
            <span className="field-hint">Research results will be saved to this project's .research/ directory</span>
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
            disabled={!query.trim() || !selectedProject}
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
