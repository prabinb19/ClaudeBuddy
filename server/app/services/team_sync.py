"""Snippets service - discover markdown files across projects."""

from pathlib import Path
from typing import Optional
from datetime import datetime

from .claude_reader import claude_reader


class SnippetsService:
    """Service for discovering markdown files across Claude projects."""

    def _find_md_files(self, project_path: Path, max_depth: int = 3) -> list[Path]:
        """Find markdown files in project, respecting common ignore patterns."""
        ignore_dirs = {
            "node_modules", ".git", ".venv", "venv", "__pycache__",
            "dist", "build", ".next", ".nuxt", "target", "vendor",
            ".idea", ".vscode", "coverage", ".pytest_cache", ".cache",
            "env", ".env", "eggs", ".eggs", ".tox", ".mypy_cache"
        }

        md_files = []

        def scan(path: Path, depth: int):
            if depth > max_depth:
                return

            try:
                for item in path.iterdir():
                    if item.is_file() and item.suffix.lower() == ".md":
                        md_files.append(item)
                    elif item.is_dir() and item.name not in ignore_dirs and not item.name.startswith("."):
                        scan(item, depth + 1)
            except (PermissionError, OSError):
                pass

        scan(project_path, 0)
        return md_files

    async def get_all_markdown_files(self) -> dict:
        """Scan all projects and find markdown files."""
        # Get projects from existing claude_reader
        projects = await claude_reader.get_all_projects()

        results = []
        by_project = {}

        for project in projects:
            project_path = Path(project["path"])

            if not project_path.exists():
                continue

            project_name = project["name"]
            project_files = []

            # Find all .md files in this project
            md_files = self._find_md_files(project_path)

            for md_file in md_files:
                try:
                    content = md_file.read_text(encoding="utf-8")
                    lines = content.strip().split("\n")

                    # Get title from first heading
                    title = md_file.stem
                    if lines and lines[0].startswith("# "):
                        title = lines[0][2:].strip()

                    # Get preview from first non-heading line
                    preview = ""
                    for line in lines[1:10]:
                        line = line.strip()
                        if line and not line.startswith("#"):
                            preview = line[:100]
                            break

                    file_info = {
                        "id": str(md_file),
                        "filename": md_file.name,
                        "title": title,
                        "preview": preview,
                        "path": str(md_file),
                        "relative_path": str(md_file.relative_to(project_path)),
                        "project_path": str(project_path),
                        "project_name": project_name,
                        "modified": datetime.fromtimestamp(md_file.stat().st_mtime).isoformat(),
                        "size": len(content),
                    }

                    results.append(file_info)
                    project_files.append(file_info)

                except Exception:
                    continue

            if project_files:
                by_project[project_name] = {
                    "project_name": project_name,
                    "project_path": str(project_path),
                    "files": project_files,
                }

        # Sort by modified date, newest first
        results.sort(key=lambda x: x["modified"], reverse=True)

        return {
            "files": results,
            "by_project": list(by_project.values()),
            "total": len(results),
        }

    def get_file_content(self, file_path: str) -> Optional[dict]:
        """Get content of a specific markdown file."""
        path = Path(file_path)

        if not path.exists() or path.suffix.lower() != ".md":
            return None

        try:
            content = path.read_text(encoding="utf-8")
            lines = content.strip().split("\n")
            title = path.stem
            if lines and lines[0].startswith("# "):
                title = lines[0][2:].strip()

            return {
                "path": str(path),
                "filename": path.name,
                "title": title,
                "content": content,
                "modified": datetime.fromtimestamp(path.stat().st_mtime).isoformat(),
            }
        except Exception:
            return None

    def copy_to_project(self, source_path: str, target_project: str, mode: str = "append") -> dict:
        """Copy markdown content to a project's CLAUDE.md."""
        source = self.get_file_content(source_path)
        if not source:
            return {"success": False, "error": "Source file not found"}

        target = Path(target_project)
        if not target.exists():
            return {"success": False, "error": "Target project not found"}

        claude_md = target / "CLAUDE.md"

        try:
            if mode == "append":
                existing = ""
                if claude_md.exists():
                    existing = claude_md.read_text(encoding="utf-8")

                separator = "\n\n---\n\n" if existing.strip() else ""
                new_content = existing + separator + source["content"]
                claude_md.write_text(new_content, encoding="utf-8")
            else:
                claude_md.write_text(source["content"], encoding="utf-8")

            return {
                "success": True,
                "target": str(claude_md),
                "source": source["title"],
            }
        except Exception as e:
            return {"success": False, "error": str(e)}


# Singleton
_service: Optional[SnippetsService] = None


def get_snippets_service() -> SnippetsService:
    """Get the snippets service singleton."""
    global _service
    if _service is None:
        _service = SnippetsService()
    return _service
