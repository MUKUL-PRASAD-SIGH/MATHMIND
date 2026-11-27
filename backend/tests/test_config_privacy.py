"""T7.7 step 5: learner work never leaves the machine by accident."""

import pytest
from pydantic import ValidationError

from app.core.config import Settings, is_local_host

pytestmark = pytest.mark.unit


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost:11434",
        "http://127.0.0.1:11434",
        "http://[::1]:11434",
        "http://192.168.1.20:11434",  # Ollama on another machine in the same LAN
        "http://10.0.0.5:11434",
        "http://ollama:11434",  # docker-compose service name
    ],
)
def test_local_hosts_are_accepted(url: str) -> None:
    assert is_local_host(url)
    assert Settings(ollama_url=url).ollama_url == url


@pytest.mark.parametrize(
    "url",
    ["https://api.example.com", "http://8.8.8.8:11434", "https://ollama.example.org:443", "not a url"],
)
def test_remote_hosts_are_refused(url: str) -> None:
    assert not is_local_host(url)
    with pytest.raises(ValidationError, match="not a local host"):
        Settings(ollama_url=url)


def test_remote_host_needs_explicit_opt_in() -> None:
    s = Settings(ollama_url="https://ollama.example.org", allow_remote_ollama=True)
    assert s.allow_remote_ollama
