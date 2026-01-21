const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3456;

app.use(cors());
app.use(express.json());

// Cross-platform Claude directory detection
function getClaudeDir() {
  const homeDir = os.homedir();

  // Standard location for all platforms
  const standardPath = path.join(homeDir, '.claude');
  if (fs.existsSync(standardPath)) {
    return standardPath;
  }

  // Windows alternative locations
  if (process.platform === 'win32') {
    const appDataPath = path.join(process.env.APPDATA || '', 'claude');
    if (fs.existsSync(appDataPath)) {
      return appDataPath;
    }
    const localAppDataPath = path.join(process.env.LOCALAPPDATA || '', 'claude');
    if (fs.existsSync(localAppDataPath)) {
      return localAppDataPath;
    }
  }

  // Return standard path even if it doesn't exist (will show empty state)
  return standardPath;
}

const CLAUDE_DIR = getClaudeDir();

// Check if Claude Code data exists
function claudeDataExists() {
  return fs.existsSync(CLAUDE_DIR) && fs.existsSync(path.join(CLAUDE_DIR, 'projects'));
}

// Health check and status endpoint
app.get('/api/health', (req, res) => {
  const hasData = claudeDataExists();
  res.json({
    status: 'ok',
    version: '1.0.0',
    claudeDir: CLAUDE_DIR,
    hasClaudeData: hasData,
    platform: process.platform,
    nodeVersion: process.version
  });
});

// Parse JSONL file and return array of objects
async function parseJSONL(filePath) {
  const results = [];
  if (!fs.existsSync(filePath)) return results;

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        results.push(JSON.parse(line));
      } catch (e) {
        // Skip malformed lines
      }
    }
  }
  return results;
}

// Claude API pricing (per million tokens)
const PRICING = {
  'claude-opus-4-5-20251101': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-sonnet-4-20250514': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-3-5-sonnet-20241022': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
  'default': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }
};

// Calculate cost for a model's usage
function calculateCost(modelId, usage) {
  const pricing = PRICING[modelId] || PRICING['default'];
  const inputCost = ((usage.inputTokens || 0) / 1_000_000) * pricing.input;
  const outputCost = ((usage.outputTokens || 0) / 1_000_000) * pricing.output;
  const cacheReadCost = ((usage.cacheReadInputTokens || 0) / 1_000_000) * pricing.cacheRead;
  const cacheWriteCost = ((usage.cacheCreationInputTokens || 0) / 1_000_000) * pricing.cacheWrite;
  return inputCost + outputCost + cacheReadCost + cacheWriteCost;
}

// Get basic stats
app.get('/api/stats', async (req, res) => {
  try {
    // Check if Claude data exists
    if (!claudeDataExists()) {
      return res.json({
        stats: {
          totalSessions: 0,
          modelUsage: {},
          dailyActivity: []
        },
        costs: { total: 0, byModel: {} },
        charts: { dailyActivity: [], dailyTokens: [] },
        message: 'No Claude Code data found. Start using Claude Code to see your stats here!'
      });
    }

    const statsPath = path.join(CLAUDE_DIR, 'stats-cache.json');
    const configPath = path.join(CLAUDE_DIR, '.claude.json');

    let stats = {};
    let config = {};

    if (fs.existsSync(statsPath)) {
      stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
    }

    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    // Calculate costs per model
    const costByModel = {};
    let totalCost = 0;
    if (stats.modelUsage) {
      for (const [modelId, usage] of Object.entries(stats.modelUsage)) {
        const cost = calculateCost(modelId, usage);
        costByModel[modelId] = {
          cost: cost,
          inputTokens: usage.inputTokens || 0,
          outputTokens: usage.outputTokens || 0,
          cacheReadTokens: usage.cacheReadInputTokens || 0,
          cacheWriteTokens: usage.cacheCreationInputTokens || 0
        };
        totalCost += cost;
      }
    }

    // Process daily activity for charts
    const dailyStats = (stats.dailyActivity || []).map(day => ({
      date: day.date,
      messages: day.messageCount || 0,
      sessions: day.sessionCount || 0,
      toolCalls: day.toolCallCount || 0
    }));

    // Process daily token usage
    const dailyTokens = (stats.dailyModelTokens || []).map(day => {
      let tokens = 0;
      if (day.tokensByModel) {
        tokens = Object.values(day.tokensByModel).reduce((sum, t) => sum + t, 0);
      }
      return { date: day.date, tokens };
    });

    res.json({
      stats,
      startupCount: config.numStartups || 0,
      theme: config.theme || 'dark',
      autoUpdates: config.autoUpdate ?? true,
      costs: {
        total: totalCost,
        byModel: costByModel
      },
      charts: {
        dailyActivity: dailyStats,
        dailyTokens: dailyTokens
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get command history (grouped by date and session)
app.get('/api/history', async (req, res) => {
  try {
    const historyPath = path.join(CLAUDE_DIR, 'history.jsonl');
    const history = await parseJSONL(historyPath);

    // Sort by timestamp descending
    history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Group by date, then by session
    const grouped = {};

    for (const item of history) {
      const date = new Date(item.timestamp).toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });

      if (!grouped[date]) {
        grouped[date] = { date, sessions: {} };
      }

      const sessionId = item.sessionId || 'unknown';
      if (!grouped[date].sessions[sessionId]) {
        grouped[date].sessions[sessionId] = {
          sessionId,
          project: item.project,
          projectName: item.project?.split('/').pop() || 'Unknown Project',
          prompts: [],
          firstTimestamp: item.timestamp,
          lastTimestamp: item.timestamp
        };
      }

      grouped[date].sessions[sessionId].prompts.push({
        text: item.display,
        timestamp: item.timestamp
      });

      // Track time range
      if (item.timestamp < grouped[date].sessions[sessionId].firstTimestamp) {
        grouped[date].sessions[sessionId].firstTimestamp = item.timestamp;
      }
      if (item.timestamp > grouped[date].sessions[sessionId].lastTimestamp) {
        grouped[date].sessions[sessionId].lastTimestamp = item.timestamp;
      }
    }

    // Convert to array format and generate summaries
    const result = Object.values(grouped).map(dayGroup => ({
      date: dayGroup.date,
      sessions: Object.values(dayGroup.sessions).map(session => {
        // Generate a simple topic summary from first few prompts
        const allText = session.prompts.map(p => p.text).join(' ').toLowerCase();
        let topic = 'General coding';

        if (allText.includes('bug') || allText.includes('fix') || allText.includes('error')) {
          topic = 'Debugging';
        } else if (allText.includes('test')) {
          topic = 'Testing';
        } else if (allText.includes('create') || allText.includes('new') || allText.includes('add')) {
          topic = 'Feature development';
        } else if (allText.includes('refactor') || allText.includes('clean')) {
          topic = 'Refactoring';
        } else if (allText.includes('explain') || allText.includes('how') || allText.includes('what')) {
          topic = 'Learning/Questions';
        } else if (allText.includes('review') || allText.includes('pr')) {
          topic = 'Code review';
        } else if (allText.includes('database') || allText.includes('sql')) {
          topic = 'Database work';
        } else if (allText.includes('deploy') || allText.includes('docker')) {
          topic = 'DevOps';
        }

        return {
          ...session,
          topic,
          promptCount: session.prompts.length,
          preview: session.prompts[0]?.text?.substring(0, 100) + '...'
        };
      }).sort((a, b) => b.lastTimestamp - a.lastTimestamp)
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Load full conversation for a session from history
app.get('/api/history/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const projectsDir = path.join(CLAUDE_DIR, 'projects');

    if (!fs.existsSync(projectsDir)) {
      return res.status(404).json({ error: 'No projects found' });
    }

    // Search for the session file across all projects
    const projectDirs = fs.readdirSync(projectsDir);
    let sessionPath = null;
    let projectPath = null;

    for (const dir of projectDirs) {
      const possiblePath = path.join(projectsDir, dir, `${sessionId}.jsonl`);
      if (fs.existsSync(possiblePath)) {
        sessionPath = possiblePath;
        projectPath = dir.replace(/-/g, '/');
        break;
      }
    }

    if (!sessionPath) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const rawMessages = await parseJSONL(sessionPath);

    // Filter and format messages
    const messages = rawMessages
      .filter(m => m.type === 'user' || m.type === 'assistant' || m.message?.role === 'user' || m.message?.role === 'assistant')
      .map(m => {
        const role = m.type === 'user' || m.message?.role === 'user' ? 'user' : 'assistant';
        const content = extractContent(m.message);
        return {
          role,
          content,
          timestamp: m.timestamp,
          model: m.message?.model,
        };
      })
      .filter(m => m.content);

    res.json({
      sessionId,
      project: projectPath,
      messageCount: messages.length,
      messages
    });
  } catch (error) {
    console.error('History session fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Analyze session content to extract insights
async function analyzeSession(sessionPath) {
  const messages = await parseJSONL(sessionPath);
  const insights = {
    topics: [],
    tasks: [],
    technologies: [],
    messageCount: 0,
    firstTimestamp: null,
    lastTimestamp: null
  };

  const topicKeywords = {
    'Bug Fix': /\b(fix|bug|error|issue|broken|crash|fail)/i,
    'New Feature': /\b(add|create|implement|build|new feature|feature)/i,
    'Refactoring': /\b(refactor|clean|reorganize|restructure|improve)/i,
    'Testing': /\b(test|spec|coverage|jest|pytest|unittest)/i,
    'Documentation': /\b(doc|readme|comment|jsdoc|explain)/i,
    'Styling': /\b(css|style|design|ui|layout|theme)/i,
    'API Work': /\b(api|endpoint|route|rest|graphql|fetch)/i,
    'Database': /\b(database|db|sql|mongo|postgres|query|migration)/i,
    'DevOps': /\b(deploy|docker|ci|cd|build|pipeline|kubernetes)/i,
    'Security': /\b(auth|security|permission|token|encrypt)/i,
    'Performance': /\b(optimize|performance|speed|cache|lazy)/i,
  };

  const techKeywords = {
    'React': /\breact\b/i,
    'Node.js': /\b(node|express|npm)\b/i,
    'TypeScript': /\btypescript|\.tsx?\b/i,
    'Python': /\b(python|pip|django|flask)\b/i,
    'SQL': /\b(sql|postgres|mysql|sqlite)\b/i,
    'Docker': /\bdocker\b/i,
    'Git': /\b(git|commit|branch|merge|pr)\b/i,
    'CSS': /\b(css|scss|tailwind|styled)/i,
    'Testing': /\b(jest|pytest|test|spec)\b/i,
  };

  const seenTopics = new Set();
  const seenTech = new Set();
  const taskPatterns = [];

  for (const msg of messages) {
    if (msg.timestamp) {
      if (!insights.firstTimestamp || msg.timestamp < insights.firstTimestamp) {
        insights.firstTimestamp = msg.timestamp;
      }
      if (!insights.lastTimestamp || msg.timestamp > insights.lastTimestamp) {
        insights.lastTimestamp = msg.timestamp;
      }
    }

    const content = extractContent(msg.message);
    if (!content) continue;

    insights.messageCount++;

    // Detect topics
    for (const [topic, regex] of Object.entries(topicKeywords)) {
      if (regex.test(content) && !seenTopics.has(topic)) {
        seenTopics.add(topic);
        insights.topics.push(topic);
      }
    }

    // Detect technologies
    for (const [tech, regex] of Object.entries(techKeywords)) {
      if (regex.test(content) && !seenTech.has(tech)) {
        seenTech.add(tech);
        insights.technologies.push(tech);
      }
    }

    // Extract task-like phrases from user messages
    if (msg.type === 'user' || msg.message?.role === 'user') {
      // Look for action phrases
      const actionMatch = content.match(/^(add|create|fix|update|implement|build|make|write|refactor|test|debug|deploy|setup|configure|install|remove|delete|change|modify)\s+.{10,60}/i);
      if (actionMatch && taskPatterns.length < 5) {
        taskPatterns.push(actionMatch[0].trim());
      }
    }
  }

  insights.tasks = taskPatterns;
  return insights;
}

// Get all projects with insights
app.get('/api/projects', async (req, res) => {
  try {
    const projectsDir = path.join(CLAUDE_DIR, 'projects');
    if (!fs.existsSync(projectsDir)) {
      return res.json([]);
    }

    const projects = [];
    const projectDirs = fs.readdirSync(projectsDir);

    for (const dir of projectDirs) {
      const projectPath = path.join(projectsDir, dir);
      const stat = fs.statSync(projectPath);

      if (stat.isDirectory()) {
        // Get session files
        const files = fs.readdirSync(projectPath).filter(f => f.endsWith('.jsonl'));

        // Decode project path from directory name
        const decodedPath = dir.replace(/-/g, '/');
        const projectName = decodedPath.split('/').pop() || 'Unknown';

        // Analyze recent sessions for insights
        const sortedFiles = files
          .map(f => ({
            name: f,
            path: path.join(projectPath, f),
            mtime: fs.statSync(path.join(projectPath, f)).mtime
          }))
          .sort((a, b) => b.mtime - a.mtime);

        // Analyze up to 3 most recent sessions
        const allTopics = new Set();
        const allTech = new Set();
        const allTasks = [];
        let totalMessages = 0;
        let latestActivity = null;

        for (const file of sortedFiles.slice(0, 3)) {
          const insights = await analyzeSession(file.path);
          insights.topics.forEach(t => allTopics.add(t));
          insights.technologies.forEach(t => allTech.add(t));
          allTasks.push(...insights.tasks);
          totalMessages += insights.messageCount;
          if (!latestActivity || (insights.lastTimestamp && insights.lastTimestamp > latestActivity)) {
            latestActivity = insights.lastTimestamp;
          }
        }

        projects.push({
          id: dir,
          path: decodedPath,
          name: projectName,
          sessionCount: files.length,
          lastModified: stat.mtime,
          lastActivity: latestActivity,
          totalMessages,
          topics: Array.from(allTopics).slice(0, 5),
          technologies: Array.from(allTech).slice(0, 6),
          recentTasks: allTasks.slice(0, 4),
          sessions: sortedFiles.slice(0, 5).map(f => ({
            id: f.name.replace('.jsonl', ''),
            file: f.name,
            lastModified: f.mtime
          }))
        });
      }
    }

    // Sort by last activity
    projects.sort((a, b) => new Date(b.lastActivity || b.lastModified) - new Date(a.lastActivity || a.lastModified));

    res.json(projects);
  } catch (error) {
    console.error('Projects fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Extract text content from message (handles both string and array formats)
function extractContent(message) {
  if (!message) return '';
  const content = message.content;

  // String content (user messages)
  if (typeof content === 'string') {
    return content;
  }

  // Array content (assistant messages with thinking/text blocks)
  if (Array.isArray(content)) {
    return content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');
  }

  return '';
}

// Extract tool calls from message content
function extractToolCalls(message) {
  if (!message || !Array.isArray(message.content)) return [];

  return message.content
    .filter(block => block.type === 'tool_use')
    .map(block => ({
      id: block.id,
      name: block.name,
      input: block.input
    }));
}

// Extract code operations from a session's raw messages
function extractCodeOperations(rawMessages) {
  const operations = [];

  for (const msg of rawMessages) {
    if (msg.type !== 'assistant' && msg.message?.role !== 'assistant') continue;

    const toolCalls = extractToolCalls(msg.message);

    for (const tool of toolCalls) {
      // Write operations (new files)
      if (tool.name === 'Write') {
        operations.push({
          type: 'write',
          timestamp: msg.timestamp,
          filePath: tool.input?.file_path,
          content: tool.input?.content,
          language: getLanguageFromPath(tool.input?.file_path)
        });
      }

      // Edit operations (file changes)
      if (tool.name === 'Edit') {
        operations.push({
          type: 'edit',
          timestamp: msg.timestamp,
          filePath: tool.input?.file_path,
          oldString: tool.input?.old_string,
          newString: tool.input?.new_string,
          language: getLanguageFromPath(tool.input?.file_path)
        });
      }

      // Bash commands
      if (tool.name === 'Bash') {
        operations.push({
          type: 'bash',
          timestamp: msg.timestamp,
          command: tool.input?.command,
          description: tool.input?.description
        });
      }

      // Read operations (for context)
      if (tool.name === 'Read') {
        operations.push({
          type: 'read',
          timestamp: msg.timestamp,
          filePath: tool.input?.file_path
        });
      }
    }
  }

  return operations;
}

// Group code operations by topics (derived from user prompts)
function groupCodeByTopics(rawMessages) {
  const topics = [];
  let currentTopic = null;
  let currentOps = [];

  for (const msg of rawMessages) {
    // User message starts a new topic
    if (msg.type === 'user' || msg.message?.role === 'user') {
      // Save previous topic if it has operations
      if (currentTopic && currentOps.length > 0) {
        topics.push({
          topic: currentTopic,
          timestamp: msg.timestamp,
          operations: currentOps,
          files: groupOpsByFile(currentOps)
        });
      }

      // Extract topic from user message
      const content = typeof msg.message?.content === 'string'
        ? msg.message.content
        : msg.message?.content?.[0]?.text || '';

      // Create a short topic title (first line or first 80 chars)
      currentTopic = content.split('\n')[0].substring(0, 80);
      if (content.length > 80) currentTopic += '...';
      currentOps = [];
    }

    // Assistant message - extract operations
    if (msg.type === 'assistant' || msg.message?.role === 'assistant') {
      const toolCalls = extractToolCalls(msg.message);

      for (const tool of toolCalls) {
        if (tool.name === 'Write') {
          currentOps.push({
            type: 'write',
            timestamp: msg.timestamp,
            filePath: tool.input?.file_path,
            content: tool.input?.content,
            language: getLanguageFromPath(tool.input?.file_path)
          });
        }

        if (tool.name === 'Edit') {
          currentOps.push({
            type: 'edit',
            timestamp: msg.timestamp,
            filePath: tool.input?.file_path,
            oldString: tool.input?.old_string,
            newString: tool.input?.new_string,
            language: getLanguageFromPath(tool.input?.file_path)
          });
        }

        if (tool.name === 'Bash') {
          currentOps.push({
            type: 'bash',
            timestamp: msg.timestamp,
            command: tool.input?.command,
            description: tool.input?.description
          });
        }
      }
    }
  }

  // Don't forget last topic
  if (currentTopic && currentOps.length > 0) {
    topics.push({
      topic: currentTopic,
      operations: currentOps,
      files: groupOpsByFile(currentOps)
    });
  }

  return topics;
}

// Group operations by file
function groupOpsByFile(operations) {
  const fileGroups = {};
  const bashCommands = [];

  for (const op of operations) {
    if (op.type === 'bash') {
      bashCommands.push(op);
    } else if (op.filePath) {
      const fileName = op.filePath.split('/').pop();
      if (!fileGroups[op.filePath]) {
        fileGroups[op.filePath] = {
          path: op.filePath,
          fileName: fileName,
          language: op.language,
          operations: []
        };
      }
      fileGroups[op.filePath].operations.push(op);
    }
  }

  const result = Object.values(fileGroups);

  // Add bash commands as a pseudo-file group if any
  if (bashCommands.length > 0) {
    result.push({
      path: 'Terminal Commands',
      fileName: 'Terminal',
      language: 'bash',
      operations: bashCommands,
      isCommands: true
    });
  }

  return result;
}

// Get language from file extension for syntax highlighting
function getLanguageFromPath(filePath) {
  if (!filePath) return 'text';
  const ext = path.extname(filePath).toLowerCase();
  const langMap = {
    '.js': 'javascript',
    '.jsx': 'jsx',
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.py': 'python',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.css': 'css',
    '.scss': 'scss',
    '.html': 'html',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.md': 'markdown',
    '.sh': 'bash',
    '.sql': 'sql',
    '.xml': 'xml',
  };
  return langMap[ext] || 'text';
}

// Get session details
app.get('/api/sessions/:projectId/:sessionId', async (req, res) => {
  try {
    const { projectId, sessionId } = req.params;
    const sessionPath = path.join(CLAUDE_DIR, 'projects', projectId, `${sessionId}.jsonl`);

    if (!fs.existsSync(sessionPath)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const rawMessages = await parseJSONL(sessionPath);

    // Filter to user/assistant messages and extract content
    const messages = rawMessages
      .filter(m => m.type === 'user' || m.type === 'assistant' || m.message?.role === 'user' || m.message?.role === 'assistant')
      .map(m => {
        const role = m.type === 'user' || m.message?.role === 'user' ? 'user' : 'assistant';
        const content = extractContent(m.message);
        return {
          role,
          content: content.substring(0, 2000), // Limit content length
          timestamp: m.timestamp,
          model: m.message?.model,
        };
      })
      .filter(m => m.content); // Remove empty messages

    // Extract code operations (flat list)
    const codeOperations = extractCodeOperations(rawMessages);

    // Group code operations by topics
    const codeTopics = groupCodeByTopics(rawMessages);

    // Get session metadata
    const firstMsg = rawMessages.find(m => m.timestamp);
    const lastMsg = [...rawMessages].reverse().find(m => m.timestamp);

    // Count operations by type
    const opCounts = {
      writes: codeOperations.filter(op => op.type === 'write').length,
      edits: codeOperations.filter(op => op.type === 'edit').length,
      commands: codeOperations.filter(op => op.type === 'bash').length,
      reads: codeOperations.filter(op => op.type === 'read').length,
      topics: codeTopics.length
    };

    res.json({
      id: sessionId,
      messageCount: messages.length,
      startTime: firstMsg?.timestamp,
      endTime: lastMsg?.timestamp,
      messages,
      codeOperations,
      codeTopics,
      operationCounts: opCounts
    });
  } catch (error) {
    console.error('Session fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get code operations for a session (lighter endpoint for just code changes)
app.get('/api/sessions/:projectId/:sessionId/code', async (req, res) => {
  try {
    const { projectId, sessionId } = req.params;
    const sessionPath = path.join(CLAUDE_DIR, 'projects', projectId, `${sessionId}.jsonl`);

    if (!fs.existsSync(sessionPath)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const rawMessages = await parseJSONL(sessionPath);
    const codeOperations = extractCodeOperations(rawMessages);

    // Group by file
    const fileChanges = {};
    for (const op of codeOperations) {
      if (op.type === 'write' || op.type === 'edit') {
        const file = op.filePath || 'unknown';
        if (!fileChanges[file]) {
          fileChanges[file] = {
            path: file,
            language: op.language,
            operations: []
          };
        }
        fileChanges[file].operations.push(op);
      }
    }

    // Get bash commands
    const commands = codeOperations
      .filter(op => op.type === 'bash')
      .map(op => ({
        command: op.command,
        description: op.description,
        timestamp: op.timestamp
      }));

    res.json({
      sessionId,
      fileChanges: Object.values(fileChanges),
      commands,
      summary: {
        filesModified: Object.keys(fileChanges).length,
        totalEdits: codeOperations.filter(op => op.type === 'edit').length,
        totalWrites: codeOperations.filter(op => op.type === 'write').length,
        totalCommands: commands.length
      }
    });
  } catch (error) {
    console.error('Code operations fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// MCP servers cache
let mcpCache = {
  data: null,
  timestamp: 0,
  TTL: 1000 * 60 * 30 // 30 minutes
};

// Fetch MCP servers from GitHub
async function fetchMCPFromGitHub() {
  const queries = [
    'mcp-server in:name,description',
    'model-context-protocol in:name,description',
    'anthropic mcp in:name,description'
  ];

  const allRepos = [];
  const seen = new Set();

  for (const query of queries) {
    try {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=30`;
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'claude-dashboard'
        }
      });

      if (!response.ok) continue;

      const data = await response.json();
      for (const repo of data.items || []) {
        if (!seen.has(repo.full_name)) {
          seen.add(repo.full_name);
          allRepos.push(repo);
        }
      }
    } catch (e) {
      console.error('GitHub fetch error:', e.message);
    }
  }

  return allRepos;
}

// Fetch from Smithery.ai registry
async function fetchMCPFromSmithery() {
  try {
    const response = await fetch('https://registry.smithery.ai/servers?pageSize=50', {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'claude-dashboard'
      }
    });

    if (!response.ok) return [];

    const data = await response.json();
    return data.servers || [];
  } catch (e) {
    console.error('Smithery fetch error:', e.message);
    return [];
  }
}

// Categorize MCP server based on name/description
function categorizeServer(name, description) {
  const text = `${name} ${description}`.toLowerCase();

  if (text.match(/postgres|mysql|sqlite|database|db|mongo|redis|supabase/)) return 'database';
  if (text.match(/github|gitlab|git|bitbucket/)) return 'dev';
  if (text.match(/docker|kubernetes|k8s|container/)) return 'dev';
  if (text.match(/aws|gcp|azure|cloud|s3|lambda/)) return 'cloud';
  if (text.match(/slack|discord|telegram|email|notification/)) return 'communication';
  if (text.match(/notion|linear|jira|asana|todoist|trello/)) return 'productivity';
  if (text.match(/fetch|web|scrape|browser|puppeteer|playwright|http/)) return 'web';
  if (text.match(/search|brave|google|bing/)) return 'web';
  if (text.match(/file|filesystem|fs|memory|storage/)) return 'core';

  return 'other';
}

// Get MCP servers (combined from multiple sources)
app.get('/api/mcp', async (req, res) => {
  try {
    // Check cache (skip if refresh requested)
    const forceRefresh = req.query.refresh === '1';
    const now = Date.now();
    if (!forceRefresh && mcpCache.data && (now - mcpCache.timestamp) < mcpCache.TTL) {
      return res.json(mcpCache.data);
    }

    // Fetch from sources in parallel
    const [githubRepos, smitheryServers] = await Promise.all([
      fetchMCPFromGitHub(),
      fetchMCPFromSmithery()
    ]);

    const servers = [];
    const seen = new Set();

    // Process Smithery servers first (they have better metadata)
    for (const server of smitheryServers) {
      const id = server.qualifiedName || server.name;
      if (seen.has(id)) continue;
      seen.add(id);

      servers.push({
        id,
        name: server.displayName || server.name,
        description: server.description || '',
        category: categorizeServer(server.name, server.description || ''),
        author: server.vendor || 'Community',
        source: 'smithery',
        homepage: server.homepage || '',
        install: server.qualifiedName ? `npx -y ${server.qualifiedName}` : '',
        stars: null,
        useCount: server.useCount || 0,
        createdAt: server.createdAt
      });
    }

    // Process GitHub repos
    for (const repo of githubRepos) {
      const id = repo.name;
      if (seen.has(id) || seen.has(repo.full_name)) continue;
      seen.add(id);

      // Try to determine npm package name
      let npmPackage = '';
      if (repo.full_name.startsWith('anthropics/') || repo.full_name.startsWith('modelcontextprotocol/')) {
        npmPackage = `@anthropic-ai/${repo.name}`;
      } else if (repo.name.startsWith('mcp-')) {
        npmPackage = repo.name;
      }

      servers.push({
        id,
        name: repo.name.replace(/^mcp-server-?/i, '').replace(/-/g, ' '),
        description: repo.description || '',
        category: categorizeServer(repo.name, repo.description || ''),
        author: repo.owner?.login || 'Unknown',
        source: 'github',
        homepage: repo.html_url,
        install: npmPackage ? `npx -y ${npmPackage}` : `git clone ${repo.clone_url}`,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        updatedAt: repo.updated_at
      });
    }

    // Sort by stars/popularity
    servers.sort((a, b) => {
      const aScore = (a.stars || 0) + (a.useCount || 0) * 10;
      const bScore = (b.stars || 0) + (b.useCount || 0) * 10;
      return bScore - aScore;
    });

    // Cache results
    mcpCache = {
      data: { servers, fetchedAt: new Date().toISOString() },
      timestamp: now,
      TTL: mcpCache.TTL
    };

    res.json(mcpCache.data);
  } catch (error) {
    console.error('MCP fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Productivity metrics cache
let productivityCache = {
  data: null,
  timestamp: 0,
  TTL: 1000 * 60 * 5 // 5 minutes
};

// Compute velocity metrics from sessions
function computeVelocityMetrics(sessions) {
  const filesModifiedByDay = {};
  let totalWrites = 0;
  let totalEdits = 0;
  let totalLinesChanged = 0;
  const operationsByDay = {};

  for (const session of sessions) {
    const date = session.date;
    if (!filesModifiedByDay[date]) {
      filesModifiedByDay[date] = new Set();
    }
    if (!operationsByDay[date]) {
      operationsByDay[date] = { writes: 0, edits: 0 };
    }

    for (const op of session.operations) {
      if (op.type === 'write') {
        totalWrites++;
        operationsByDay[date].writes++;
        if (op.filePath) {
          filesModifiedByDay[date].add(op.filePath);
        }
        // Estimate lines from content
        if (op.content) {
          totalLinesChanged += (op.content.match(/\n/g) || []).length + 1;
        }
      } else if (op.type === 'edit') {
        totalEdits++;
        operationsByDay[date].edits++;
        if (op.filePath) {
          filesModifiedByDay[date].add(op.filePath);
        }
        // Estimate lines changed from old/new strings
        const oldLines = op.oldString ? (op.oldString.match(/\n/g) || []).length + 1 : 0;
        const newLines = op.newString ? (op.newString.match(/\n/g) || []).length + 1 : 0;
        totalLinesChanged += Math.abs(newLines - oldLines) + Math.min(oldLines, newLines);
      }
    }
  }

  // Convert sets to counts
  const filesPerDay = Object.entries(filesModifiedByDay)
    .map(([date, files]) => ({ date, count: files.size }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Operations trend (last 14 days)
  const sortedDays = Object.keys(operationsByDay).sort();
  const last14Days = sortedDays.slice(-14);
  const operationsTrend = last14Days.map(date => ({
    date,
    writes: operationsByDay[date]?.writes || 0,
    edits: operationsByDay[date]?.edits || 0,
    total: (operationsByDay[date]?.writes || 0) + (operationsByDay[date]?.edits || 0)
  }));

  const totalCodeOperations = totalWrites + totalEdits;
  const activeDays = Object.keys(operationsByDay).length;
  const averageOpsPerDay = activeDays > 0 ? Math.round(totalCodeOperations / activeDays * 10) / 10 : 0;

  return {
    filesModifiedByDay: filesPerDay,
    linesChangedEstimate: totalLinesChanged,
    totalCodeOperations,
    totalWrites,
    totalEdits,
    averageOpsPerDay,
    operationsTrend
  };
}

// Compute efficiency metrics
function computeEfficiencyMetrics(sessions, modelUsage) {
  // Peak hours heatmap (7 days x 24 hours)
  const heatmap = Array(7).fill(null).map(() => Array(24).fill(0));
  const sessionDurations = { '0-15': 0, '15-30': 0, '30-60': 0, '60+': 0 };
  let totalOps = 0;
  let totalTokens = 0;

  for (const session of sessions) {
    // Process timestamps for heatmap
    for (const op of session.operations) {
      if (op.timestamp) {
        const date = new Date(op.timestamp);
        const dayOfWeek = date.getDay();
        const hour = date.getHours();
        heatmap[dayOfWeek][hour]++;
      }
    }

    // Session duration buckets
    if (session.startTime && session.endTime) {
      const duration = (new Date(session.endTime) - new Date(session.startTime)) / 1000 / 60;
      if (duration < 15) sessionDurations['0-15']++;
      else if (duration < 30) sessionDurations['15-30']++;
      else if (duration < 60) sessionDurations['30-60']++;
      else sessionDurations['60+']++;
    }

    totalOps += session.operations.filter(op => op.type === 'write' || op.type === 'edit').length;
  }

  // Calculate tokens from model usage
  if (modelUsage) {
    for (const usage of Object.values(modelUsage)) {
      totalTokens += (usage.inputTokens || 0) + (usage.outputTokens || 0);
    }
  }

  // Ops per session
  const opsPerSession = sessions.length > 0 ? Math.round(totalOps / sessions.length * 10) / 10 : 0;

  // Tokens per code operation
  const tokensPerCodeOp = totalOps > 0 ? Math.round(totalTokens / totalOps) : 0;

  return {
    peakHoursHeatmap: heatmap,
    sessionDurations,
    opsPerSession,
    tokensPerCodeOp,
    totalTokens
  };
}

// Compute pattern metrics
function computePatternMetrics(sessions, dailyActivity) {
  // Productivity by day of week
  const productivityByDay = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
  const daysCount = [0, 0, 0, 0, 0, 0, 0];

  const activeDates = new Set();
  const fileEditCounts = {};

  for (const session of sessions) {
    if (session.date) {
      const dayOfWeek = new Date(session.date).getDay();
      const opsCount = session.operations.filter(op => op.type === 'write' || op.type === 'edit').length;
      productivityByDay[dayOfWeek] += opsCount;
      activeDates.add(session.date);
    }

    // Track most edited files
    for (const op of session.operations) {
      if ((op.type === 'write' || op.type === 'edit') && op.filePath) {
        const fileName = op.filePath.split('/').pop();
        if (!fileEditCounts[op.filePath]) {
          fileEditCounts[op.filePath] = { path: op.filePath, name: fileName, count: 0 };
        }
        fileEditCounts[op.filePath].count++;
      }
    }
  }

  // Count days per day of week from daily activity
  if (dailyActivity) {
    for (const day of dailyActivity) {
      const dayOfWeek = new Date(day.date).getDay();
      daysCount[dayOfWeek]++;
    }
  }

  // Average productivity by day of week
  const avgProductivityByDay = productivityByDay.map((total, i) => ({
    day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i],
    total,
    average: daysCount[i] > 0 ? Math.round(total / daysCount[i] * 10) / 10 : 0
  }));

  // Calculate streaks
  const sortedDates = Array.from(activeDates).sort();
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = sortedDates.length - 1; i >= 0; i--) {
    const date = new Date(sortedDates[i]);
    date.setHours(0, 0, 0, 0);
    const expectedDate = new Date(today);
    expectedDate.setDate(expectedDate.getDate() - (sortedDates.length - 1 - i));
    expectedDate.setHours(0, 0, 0, 0);

    if (i === sortedDates.length - 1) {
      // Check if most recent activity is today or yesterday
      const diffDays = Math.floor((today - date) / (1000 * 60 * 60 * 24));
      if (diffDays <= 1) {
        tempStreak = 1;
      }
    }
  }

  // Calculate current streak by walking backwards
  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    const dateStr = checkDate.toISOString().split('T')[0];
    if (activeDates.has(dateStr)) {
      currentStreak++;
    } else if (i > 0) {
      break;
    }
  }

  // Calculate longest streak
  tempStreak = 0;
  for (let i = 0; i < sortedDates.length; i++) {
    if (i === 0) {
      tempStreak = 1;
    } else {
      const prevDate = new Date(sortedDates[i - 1]);
      const currDate = new Date(sortedDates[i]);
      const diffDays = Math.floor((currDate - prevDate) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        tempStreak++;
      } else {
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);
  }

  // Focus sessions (>30 min with sustained activity)
  const focusSessions = sessions.filter(s => {
    if (!s.startTime || !s.endTime) return false;
    const duration = (new Date(s.endTime) - new Date(s.startTime)) / 1000 / 60;
    const opsCount = s.operations.filter(op => op.type === 'write' || op.type === 'edit').length;
    return duration >= 30 && opsCount >= 3;
  }).length;

  // Most edited files (top 10)
  const mostEditedFiles = Object.values(fileEditCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    productivityByDayOfWeek: avgProductivityByDay,
    currentStreak,
    longestStreak,
    focusSessions,
    mostEditedFiles,
    totalActiveDays: activeDates.size
  };
}

// Compute tool usage metrics
function computeToolUsageMetrics(sessions) {
  const distribution = {
    Write: 0,
    Edit: 0,
    Read: 0,
    Bash: 0,
    Glob: 0,
    Grep: 0
  };

  const trendsByDay = {};

  for (const session of sessions) {
    const date = session.date;
    if (!trendsByDay[date]) {
      trendsByDay[date] = { Write: 0, Edit: 0, Read: 0, Bash: 0, Glob: 0, Grep: 0 };
    }

    for (const op of session.operations) {
      const toolName = op.type.charAt(0).toUpperCase() + op.type.slice(1);
      if (distribution.hasOwnProperty(toolName)) {
        distribution[toolName]++;
        trendsByDay[date][toolName]++;
      }
    }
  }

  // Read:Write ratio
  const totalReads = distribution.Read;
  const totalWrites = distribution.Write + distribution.Edit;
  const readWriteRatio = totalWrites > 0 ? Math.round(totalReads / totalWrites * 100) / 100 : 0;

  let ratioInsight = '';
  if (readWriteRatio > 3) {
    ratioInsight = 'Heavy research/exploration pattern';
  } else if (readWriteRatio > 1.5) {
    ratioInsight = 'Balanced reading and coding';
  } else if (readWriteRatio > 0.5) {
    ratioInsight = 'Active coding with context checks';
  } else {
    ratioInsight = 'High-velocity coding mode';
  }

  // Trends (last 14 days)
  const sortedDays = Object.keys(trendsByDay).sort();
  const last14Days = sortedDays.slice(-14);
  const trends = last14Days.map(date => ({
    date,
    ...trendsByDay[date]
  }));

  return {
    distribution,
    readWriteRatio,
    ratioInsight,
    trends
  };
}

// Extract all sessions with their operations
async function extractAllSessions() {
  const projectsDir = path.join(CLAUDE_DIR, 'projects');
  if (!fs.existsSync(projectsDir)) {
    return [];
  }

  const sessions = [];
  const projectDirs = fs.readdirSync(projectsDir);

  for (const dir of projectDirs) {
    const projectPath = path.join(projectsDir, dir);
    const stat = fs.statSync(projectPath);

    if (stat.isDirectory()) {
      const files = fs.readdirSync(projectPath).filter(f => f.endsWith('.jsonl'));

      for (const file of files) {
        const sessionPath = path.join(projectPath, file);
        const rawMessages = await parseJSONL(sessionPath);

        const operations = [];
        let startTime = null;
        let endTime = null;

        for (const msg of rawMessages) {
          if (msg.timestamp) {
            if (!startTime || msg.timestamp < startTime) startTime = msg.timestamp;
            if (!endTime || msg.timestamp > endTime) endTime = msg.timestamp;
          }

          if (msg.type === 'assistant' || msg.message?.role === 'assistant') {
            const toolCalls = extractToolCalls(msg.message);
            for (const tool of toolCalls) {
              const op = {
                type: tool.name.toLowerCase(),
                timestamp: msg.timestamp
              };

              if (tool.name === 'Write') {
                op.filePath = tool.input?.file_path;
                op.content = tool.input?.content;
              } else if (tool.name === 'Edit') {
                op.filePath = tool.input?.file_path;
                op.oldString = tool.input?.old_string;
                op.newString = tool.input?.new_string;
              } else if (tool.name === 'Read') {
                op.filePath = tool.input?.file_path;
              } else if (tool.name === 'Bash') {
                op.command = tool.input?.command;
              } else if (tool.name === 'Glob') {
                op.pattern = tool.input?.pattern;
              } else if (tool.name === 'Grep') {
                op.pattern = tool.input?.pattern;
              }

              operations.push(op);
            }
          }
        }

        if (startTime) {
          sessions.push({
            id: file.replace('.jsonl', ''),
            project: dir,
            date: startTime.split('T')[0],
            startTime,
            endTime,
            operations
          });
        }
      }
    }
  }

  return sessions;
}

// Compute all productivity metrics
async function computeProductivityMetrics() {
  const sessions = await extractAllSessions();

  // Get stats for model usage
  const statsPath = path.join(CLAUDE_DIR, 'stats-cache.json');
  let stats = {};
  if (fs.existsSync(statsPath)) {
    stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
  }

  const velocity = computeVelocityMetrics(sessions);
  const efficiency = computeEfficiencyMetrics(sessions, stats.modelUsage);
  const patterns = computePatternMetrics(sessions, stats.dailyActivity);
  const toolUsage = computeToolUsageMetrics(sessions);

  // Summary
  const summary = {
    totalActiveDays: patterns.totalActiveDays,
    mostProductiveDay: patterns.productivityByDayOfWeek.reduce((a, b) => a.total > b.total ? a : b).day,
    mostProductiveHour: getMostProductiveHour(efficiency.peakHoursHeatmap)
  };

  return {
    velocity,
    efficiency,
    patterns,
    toolUsage,
    summary,
    computedAt: new Date().toISOString()
  };
}

// Helper to find most productive hour from heatmap
function getMostProductiveHour(heatmap) {
  let maxCount = 0;
  let maxHour = 0;
  const hourTotals = Array(24).fill(0);

  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      hourTotals[hour] += heatmap[day][hour];
    }
  }

  for (let hour = 0; hour < 24; hour++) {
    if (hourTotals[hour] > maxCount) {
      maxCount = hourTotals[hour];
      maxHour = hour;
    }
  }

  return `${maxHour}:00`;
}

// Productivity metrics endpoint
app.get('/api/productivity', async (req, res) => {
  try {
    // Check if Claude data exists
    if (!claudeDataExists()) {
      return res.json({
        velocity: { filesModifiedByDay: [], linesChangedEstimate: 0, totalCodeOperations: 0, averageOpsPerDay: 0 },
        efficiency: { peakHoursHeatmap: Array(7).fill(null).map(() => Array(24).fill(0)), sessionDurations: {}, opsPerSession: 0, tokensPerCodeOp: 0 },
        patterns: { productivityByDayOfWeek: [], currentStreak: 0, longestStreak: 0, focusSessions: 0, mostEditedFiles: [] },
        toolUsage: { distribution: {}, readWriteRatio: 0, ratioInsight: '', trends: [] },
        summary: { totalActiveDays: 0, mostProductiveDay: 'N/A', mostProductiveHour: 'N/A' },
        computedAt: new Date().toISOString(),
        message: 'No Claude Code data found. Start using Claude Code to see your productivity metrics!'
      });
    }

    // Check cache (skip if refresh requested)
    const forceRefresh = req.query.refresh === '1';
    const now = Date.now();
    if (!forceRefresh && productivityCache.data && (now - productivityCache.timestamp) < productivityCache.TTL) {
      return res.json(productivityCache.data);
    }

    const metrics = await computeProductivityMetrics();

    // Cache results
    productivityCache = {
      data: metrics,
      timestamp: now,
      TTL: productivityCache.TTL
    };

    res.json(metrics);
  } catch (error) {
    console.error('Productivity metrics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get FAQ/Help content
app.get('/api/help', (req, res) => {
  const help = {
    shortcuts: [
      { key: 'Ctrl+C', description: 'Cancel current operation' },
      { key: 'Ctrl+D', description: 'Exit Claude Code' },
      { key: '/help', description: 'Show help' },
      { key: '/clear', description: 'Clear conversation' },
      { key: '/compact', description: 'Compact conversation history' },
      { key: '/config', description: 'Open configuration' },
      { key: '/cost', description: 'Show token usage and cost' },
      { key: '/doctor', description: 'Check system health' },
      { key: '/init', description: 'Initialize project with CLAUDE.md' },
      { key: '/memory', description: 'Edit memory files' },
      { key: '/model', description: 'Switch model' },
      { key: '/permissions', description: 'Manage permissions' },
      { key: '/review', description: 'Review code changes' },
      { key: '/terminal-setup', description: 'Setup terminal integration' }
    ],
    tips: [
      'Use @filename to reference specific files in your prompts',
      'Create a CLAUDE.md file in your project root for persistent instructions',
      'Use /compact to reduce context when conversations get long',
      'Set up MCP servers to give Claude access to external tools',
      'Use hooks to run commands automatically on certain events'
    ],
    links: [
      { title: 'Documentation', url: 'https://docs.anthropic.com/claude-code' },
      { title: 'GitHub Issues', url: 'https://github.com/anthropics/claude-code/issues' },
      { title: 'MCP Servers', url: 'https://github.com/modelcontextprotocol/servers' }
    ]
  };
  res.json(help);
});

// Serve static files
app.use(express.static(path.join(__dirname, '../client/dist')));
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`ClaudeBuddy running at http://localhost:${PORT}`);
});
