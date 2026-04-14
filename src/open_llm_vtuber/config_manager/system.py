# config_manager/system.py
from pydantic import Field, model_validator
from typing import Dict, List, ClassVar
from .i18n import I18nMixin, Description


class SystemConfig(I18nMixin):
    """System configuration settings."""

    conf_version: str = Field(..., alias="conf_version")
    host: str = Field(..., alias="host")
    port: int = Field(..., alias="port")
    config_alts_dir: str = Field(..., alias="config_alts_dir")
    tool_prompts: Dict[str, str] = Field(..., alias="tool_prompts")
    enable_proxy: bool = Field(False, alias="enable_proxy")

    # Wake-word settings (Whisper-based, no external API key required)
    wake_word_enabled: bool = Field(False, alias="wake_word_enabled")
    wake_word_phrases: List[str] = Field(
        default_factory=lambda: ["hey claude", "hey, claude", "hey cloud"],
        alias="wake_word_phrases",
    )
    wake_word_timeout: int = Field(60, alias="wake_word_timeout")

    # Avatar visibility
    avatar_enabled: bool = Field(True, alias="avatar_enabled")

    DESCRIPTIONS: ClassVar[Dict[str, Description]] = {
        "conf_version": Description(en="Configuration version", zh="配置文件版本"),
        "host": Description(en="Server host address", zh="服务器主机地址"),
        "port": Description(en="Server port number", zh="服务器端口号"),
        "config_alts_dir": Description(
            en="Directory for alternative configurations", zh="备用配置目录"
        ),
        "tool_prompts": Description(
            en="Tool prompts to be inserted into persona prompt",
            zh="要插入到角色提示词中的工具提示词",
        ),
        "enable_proxy": Description(
            en="Enable proxy mode for multiple clients",
            zh="启用代理模式以支持多个客户端使用一个 ws 连接",
        ),
        "wake_word_enabled": Description(
            en="Enable wake word gate (requires phrase before each conversation)",
            zh="启用唤醒词门控（每次对话前需要说唤醒词）",
        ),
        "wake_word_phrases": Description(
            en="List of accepted wake phrases (case-insensitive)",
            zh="接受的唤醒词列表（不区分大小写）",
        ),
        "wake_word_timeout": Description(
            en="Seconds of inactivity before requiring wake word again (0 = always require)",
            zh="再次需要唤醒词前的静默秒数（0 = 每次都需要）",
        ),
        "avatar_enabled": Description(
            en="Show or hide the Live2D avatar canvas (default: true). Can also be toggled in the UI.",
            zh="显示或隐藏 Live2D 虚拟形象画布（默认：true），也可在界面中切换。",
        ),
    }

    @model_validator(mode="after")
    def check_port(cls, values):
        port = values.port
        if port < 0 or port > 65535:
            raise ValueError("Port must be between 0 and 65535")
        return values
