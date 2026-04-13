"""Whisper-based wake word detector.

Uses the existing faster-whisper ASR engine to check whether a recorded
audio segment contains a configured wake phrase before passing control
to the main conversation pipeline.  No additional model download required.
"""

from typing import List

import numpy as np
from loguru import logger

from ..asr.asr_interface import ASRInterface


class WhisperWakeWordDetector:
    """Checks audio segments for a wake phrase by running ASR on them.

    Reuses the already-loaded ASR engine so there is no extra memory cost.
    Fails *open*: if ASR throws an exception the audio is passed through
    rather than silently dropped.
    """

    # Minimum audio length to bother checking — very short segments can never
    # contain a multi-syllable phrase, so we skip them outright.
    MIN_SAMPLES: int = ASRInterface.SAMPLE_RATE // 2  # 0.5 s

    def __init__(
        self,
        phrases: List[str],
        asr_engine: ASRInterface,
    ) -> None:
        self.phrases = [p.lower().strip() for p in phrases]
        self._asr = asr_engine
        logger.info(f"WhisperWakeWordDetector ready — phrases: {self.phrases}")

    async def is_wake_word(self, audio: np.ndarray) -> bool:
        """Return True if *audio* contains one of the configured wake phrases.

        Args:
            audio: Float32 numpy array of audio samples at 16 kHz.

        Returns:
            True  → wake phrase detected, forward to conversation pipeline.
            False → no wake phrase, discard the segment.
        """
        if len(audio) < self.MIN_SAMPLES:
            return False

        try:
            text = await self._asr.async_transcribe_np(audio)
            text_lower = text.lower().strip()
            logger.debug(f"Wake-word check transcript: {text_lower!r}")

            matched = any(phrase in text_lower for phrase in self.phrases)
            if not matched:
                logger.debug("Wake phrase not detected — segment discarded")
            return matched

        except Exception as exc:
            logger.error(f"Wake-word ASR error (failing open): {exc}")
            return True  # fail open: transient error should not silence the assistant
