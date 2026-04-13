"""Claude Code CLI backend for Open-LLM-VTuber.

Runs `claude -p` as an async subprocess using the user's Claude Code SEAT
license — no Anthropic API key required, zero API cost.
"""

import asyncio
import json
import uuid
from typing import AsyncIterator, List, Dict, Any, Optional

from loguru import logger

from .stateless_llm_interface import StatelessLLMInterface


class AsyncLLM(StatelessLLMInterface):
    """LLM backend that delegates to the `claude` CLI via subprocess.

    Each instance maintains a session ID so that Claude Code can resume
    conversation history between calls.  Call ``reset_session()`` to start
    a fresh session.
    """

    def __init__(
        self,
        claude_path: str = "claude",
        interrupt_method: str = "user",
    ):
        """Initialise the Claude Code CLI backend.

        Args:
            claude_path: Path (or name, if on ``$PATH``) of the ``claude``
                executable.
            interrupt_method: Reserved for future use; passed through for
                interface compatibility.
        """
        self.claude_path = claude_path
        self.session_id: Optional[str] = None
        self.interrupt_method = interrupt_method

        logger.info("Initialized Claude Code CLI AsyncLLM")
        logger.debug(f"claude_path={claude_path!r}, interrupt_method={interrupt_method!r}")

    def reset_session(self) -> None:
        """Discard the current session so the next call starts fresh."""
        logger.debug(f"Resetting session (was: {self.session_id})")
        self.session_id = None

    # ------------------------------------------------------------------
    # StatelessLLMInterface implementation
    # ------------------------------------------------------------------

    async def chat_completion(
        self,
        messages: List[Dict[str, Any]],
        system: str = None,
        tools: List[Dict[str, Any]] = None,
    ) -> AsyncIterator[Dict[str, Any]]:
        """Run a chat completion via ``claude -p`` and stream the results.

        Args:
            messages: Full conversation history.  Only the last user message
                is forwarded to Claude; prior history is managed by the
                ``--resume`` session mechanism.
            system: Optional system prompt.
            tools: Ignored — the CLI backend runs with tools disabled so the
                output stream stays clean.

        Yields:
            Dicts matching the claude_llm.py event format:
            ``{"type": "text_delta", "text": "..."}``
            ``{"type": "message_stop"}``
            ``{"type": "error", "message": "..."}``
        """
        # Extract only the last user message as the prompt.
        prompt = next(
            (m["content"] for m in reversed(messages) if m["role"] == "user"),
            "",
        )

        if not prompt:
            logger.warning("chat_completion called with no user message")
            yield {"type": "error", "message": "No user message found in conversation"}
            return

        for attempt in range(2):
            is_resume = self.session_id is not None

            # Ensure we have a session ID before the first call.
            if self.session_id is None:
                self.session_id = str(uuid.uuid4())

            cmd = self._build_command(prompt, system, is_resume)
            logger.debug(f"Attempt {attempt + 1}: running command: {cmd}")

            process: Optional[asyncio.subprocess.Process] = None
            try:
                process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )

                got_stop = False
                session_error = False

                if process.stdout is None:
                    yield {"type": "error", "message": "Claude CLI stdout unavailable"}
                    break

                # Stream stdout line-by-line with a per-line timeout.
                try:
                    while True:
                        try:
                            raw = await asyncio.wait_for(
                                process.stdout.readline(),
                                timeout=60.0,
                            )
                        except asyncio.TimeoutError:
                            logger.error("Timeout waiting for claude CLI output")
                            if process.returncode is None:
                                process.kill()
                                await process.wait()
                            yield {"type": "error", "message": "Claude CLI timed out"}
                            return

                        if not raw:
                            # EOF — process has closed stdout.
                            break

                        line = raw.decode("utf-8", errors="replace").strip()
                        if not line:
                            continue

                        event = _parse_line(line)
                        if event is None:
                            continue

                        event_type = event.get("type")

                        if event_type == "content_block_delta":
                            delta = event.get("delta", {})
                            if delta.get("type") == "text_delta":
                                yield {"type": "text_delta", "text": delta.get("text", "")}

                        elif event_type == "message_stop":
                            got_stop = True
                            yield {"type": "message_stop"}
                            break

                        elif event_type == "error":
                            # Claude CLI itself reported an error in the stream.
                            err_msg = event.get("error", {}).get("message", str(event))
                            logger.error(f"Claude CLI stream error: {err_msg}")
                            # Check if this looks like a session-not-found error.
                            if is_resume and _is_session_error(err_msg):
                                session_error = True
                            else:
                                yield {"type": "error", "message": err_msg}
                            break

                finally:
                    # Drain remaining stdout to unblock the process.
                    if process.returncode is None:
                        try:
                            await asyncio.wait_for(process.wait(), timeout=5.0)
                        except asyncio.TimeoutError:
                            process.kill()
                            await process.wait()

                # Collect stderr for diagnostics (guarded to avoid deadlock).
                try:
                    stderr_bytes = await asyncio.wait_for(process.stderr.read(), timeout=5.0)
                    stderr_text = stderr_bytes.decode("utf-8", errors="replace").strip()
                except asyncio.TimeoutError:
                    stderr_text = "<stderr read timed out>"

                exit_code = process.returncode

                # Detect session-resume failures from exit code or stderr.
                resume_failed = (
                    is_resume
                    and attempt == 0
                    and (
                        session_error
                        or (exit_code != 0 and _is_session_error(stderr_text))
                    )
                )

                if resume_failed:
                    logger.warning(
                        f"Session resume failed (session_id={self.session_id}); "
                        "retrying as a new session"
                    )
                    self.session_id = None
                    continue  # next attempt — fresh session

                if exit_code != 0 and not got_stop:
                    logger.error(
                        f"claude CLI exited with code {exit_code}. "
                        f"stderr: {stderr_text}"
                    )
                    yield {
                        "type": "error",
                        "message": (
                            f"Claude CLI exited with code {exit_code}: {stderr_text}"
                        ),
                    }

                # Success (or non-session error already yielded) — stop retrying.
                break

            except Exception as exc:
                logger.error(f"Unexpected error running claude CLI: {exc}")
                if process is not None and process.returncode is None:
                    process.kill()
                    await process.wait()
                # Reset a session that was never successfully used
                if not is_resume:
                    self.session_id = None
                yield {"type": "error", "message": str(exc)}
                break

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_command(
        self,
        prompt: str,
        system: Optional[str],
        is_resume: bool,
    ) -> List[str]:
        """Build the ``claude`` CLI argument list."""
        cmd = [
            self.claude_path,
            "-p", prompt,
            "--output-format", "stream-json",
            "--include-partial-messages",
        ]

        if is_resume:
            cmd += ["--resume", self.session_id]
        else:
            cmd += ["--session-id", self.session_id]

        if system:
            cmd += ["--system-prompt", system]

        return cmd


# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------

def _parse_line(line: str) -> Optional[Dict[str, Any]]:
    """Try to parse a JSON line from the claude CLI output.

    Returns the parsed dict, or ``None`` if the line is not valid JSON.
    """
    try:
        return json.loads(line)
    except json.JSONDecodeError:
        logger.trace(f"Non-JSON line from claude CLI (ignored): {line!r}")
        return None


def _is_session_error(text: str) -> bool:
    """Heuristic: does the text look like a session-not-found / expired error?"""
    if not text:
        return False
    lower = text.lower()
    return any(
        kw in lower
        for kw in (
            "session not found",
            "session expired",
            "invalid session",
            "no such session",
            "failed to resume",
            "cannot resume",
        )
    )
