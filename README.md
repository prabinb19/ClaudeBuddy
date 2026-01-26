# ClaudeBuddy

Your friendly companion dashboard for [Claude Code](https://claude.ai/code) - view your sessions, conversation history, usage stats, and now with **Supervisor Agent Research** capabilities!

![ClaudeBuddy Preview](./screenshots/dashboard.png)

## Features

### Dashboard & Analytics
- **Stats Overview** - See your total sessions, messages, token usage, and estimated API costs at a glance
- **Usage Charts** - Visualize your daily activity and token consumption over time
- **Projects View** - Browse all your Claude Code projects with session history
- **Conversation History** - Search and view past conversations, grouped by date
- **Export Conversations** - Export any conversation to Markdown with one click
- **Insights** - Daily summaries, error patterns, and time-on-task analysis
- **Productivity Metrics** - Track your coding velocity and patterns

### Discovery
- **MCP Browser** - Discover and install Model Context Protocol servers
- **Agents Browser** - Find trending CLAUDE.md configurations from GitHub
- **FAQ & Help** - Quick reference for keyboard shortcuts, slash commands, and tips

### NEW: Supervisor Agent Research
- **AI-Powered Research** - Uses LangGraph to orchestrate research tasks
- **Intelligent Decision Making** - Supervisor decides when enough information is gathered
- **Web Search** - Integrates with Tavily for comprehensive web research
- **Auto-Summary** - Claude synthesizes findings into structured summaries
- **Project Integration** - Saves research directly to your project's `.research/` directory

## Requirements

- **Node.js** 18 or higher
- **Python** 3.10 or higher (for Supervisor Agent)
- **Claude Code** installed and used at least once (creates `~/.claude` directory)

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/claudebuddy.git
cd claudebuddy

# Install Node.js dependencies and build frontend
npm install

# Install Python dependencies for Supervisor Agent
cd server
pip install -r requirements.txt
cd ..
```

### API Keys Setup (for Supervisor Agent)

Copy the example environment file and add your API keys:

```bash
cp .env.example .env
```

Edit `.env` and add:
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
TAVILY_API_KEY=tvly-your-key-here
```

Get your keys:
- Anthropic API Key: https://console.anthropic.com/
- Tavily API Key: https://tavily.com/

## Usage

### Start ClaudeBuddy (Python Backend - Recommended)

```bash
npm start
```

This starts the FastAPI server with full Supervisor Agent support at http://localhost:3456

### Start with Legacy Node.js Backend

```bash
npm run start:legacy
```

### Development Mode

```bash
# FastAPI backend with hot reload
npm run dev

# Or legacy Node.js dev mode
npm run dev:legacy
```

## Configuration

ClaudeBuddy reads data from your local Claude Code installation at `~/.claude/`. No configuration is required - it automatically detects your projects and sessions.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3456 | Server port |
| `ANTHROPIC_API_KEY` | - | Required for Supervisor Agent |
| `TAVILY_API_KEY` | - | Required for Supervisor Agent |
| `MAX_SEARCHES` | 10 | Maximum searches per research task |
| `DEFAULT_MODEL` | claude-sonnet-4-20250514 | Claude model for supervisor |

## Using the Supervisor Agent

1. Go to the **Research** tab
2. Enter your research query (e.g., "Best practices for React authentication")
3. Select a target project where results will be saved
4. Adjust max searches if needed (supervisor will decide when to stop)
5. Click **Start Research**

The Supervisor Agent will:
1. Search the web using Tavily
2. Evaluate if information is sufficient
3. Continue searching or proceed to writing
4. Generate a comprehensive Markdown summary
5. Save to your project's `.research/` directory

## Architecture

### Tech Stack
- **Frontend**: React + Vite
- **Backend**: FastAPI (Python) - previously Express.js
- **Agent Framework**: LangGraph + LangChain
- **Search**: Tavily API
- **LLM**: Claude (Anthropic)
- **Styling**: Plain CSS with CSS variables
- **Font**: JetBrains Mono

### Supervisor Agent Flow

```
User Query → Supervisor → Researcher (Tavily)
                ↓              ↓
         [Evaluate]  ←  [Findings]
                ↓
    [Sufficient?] → No → [More Research]
          ↓
         Yes
          ↓
       Writer (Claude)
          ↓
     Save to Project
```

## Project Structure

```
ClaudeBuddy/
├── client/                 # React frontend
│   └── src/
│       ├── App.jsx        # Main React component
│       └── App.css        # Styling
├── server/
│   ├── index.js           # Legacy Express server
│   └── app/               # FastAPI server
│       ├── main.py        # FastAPI entry point
│       ├── config.py      # Configuration
│       ├── routers/       # API endpoints
│       ├── services/      # Business logic
│       └── agents/        # Supervisor Agent
│           ├── state.py   # LangGraph state
│           ├── supervisor.py
│           ├── researcher.py
│           ├── writer.py
│           └── tools.py
└── .env.example           # Environment template
```

## API Endpoints

### Existing Endpoints
- `GET /api/health` - Health check
- `GET /api/stats` - Usage statistics
- `GET /api/projects` - List projects
- `GET /api/history` - Conversation history
- `GET /api/mcp` - MCP servers
- `GET /api/agents` - CLAUDE.md configurations
- `GET /api/insights/*` - Insights and analytics

### New Research Endpoints
- `POST /api/research/start` - Start a research task
- `GET /api/research/{id}/status` - Get task status
- `GET /api/research/{id}/result` - Get full result
- `GET /api/research/{id}/stream` - SSE progress stream
- `DELETE /api/research/{id}` - Cancel task

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [Claude Code](https://claude.ai/code) by Anthropic
- [LangGraph](https://github.com/langchain-ai/langgraph) for agent orchestration
- [Tavily](https://tavily.com/) for web search
- [JetBrains Mono](https://www.jetbrains.com/lp/mono/) font
- The Claude Code community

## Disclaimer

This is an unofficial community project and is not affiliated with or endorsed by Anthropic. Claude and Claude Code are trademarks of Anthropic.

---

Made with Claude Code
