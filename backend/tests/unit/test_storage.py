"""Unit tests for safe local file storage and content streaming."""

import io
from pathlib import Path

import pytest

from app.ingestion.exceptions import EmptyUploadError, UploadTooLargeError
from app.storage.files import LocalFileStorage

_CHUNK = 64 * 1024


def _stream(payload: bytes) -> io.BufferedReader:
    return io.BufferedReader(io.BytesIO(payload))


def test_stage_computes_sha256_size_and_promotes(tmp_path: Path) -> None:
    storage = LocalFileStorage(tmp_path)
    payload = b"id,name\n1,alice\n2,bob\n"

    staged = storage.stage(
        _stream(payload),
        original_filename="people.csv",
        media_type="text/csv",
        max_size_bytes=1024,
        chunk_size_bytes=_CHUNK,
    )

    try:
        assert staged.size_bytes == len(payload)
        assert staged.content_sha256
        assert len(staged.content_sha256) == 64
        assert staged.path.exists()
    finally:
        storage.discard_stage(staged)


def test_stage_rejects_oversize_uploads(tmp_path: Path) -> None:
    storage = LocalFileStorage(tmp_path)
    with pytest.raises(UploadTooLargeError):
        storage.stage(
            _stream(b"x" * 8),
            original_filename="data.csv",
            media_type="text/csv",
            max_size_bytes=4,
            chunk_size_bytes=_CHUNK,
        )


def test_stage_rejects_empty_uploads(tmp_path: Path) -> None:
    storage = LocalFileStorage(tmp_path)
    with pytest.raises(EmptyUploadError):
        storage.stage(
            _stream(b""),
            original_filename="empty.csv",
            media_type="text/csv",
            max_size_bytes=1024,
            chunk_size_bytes=_CHUNK,
        )


def test_promote_moves_staged_file_into_generated_key(tmp_path: Path) -> None:
    storage = LocalFileStorage(tmp_path)
    staged = storage.stage(
        _stream(b"id\n1\n2\n"),
        original_filename="people.csv",
        media_type="text/csv",
        max_size_bytes=1024,
        chunk_size_bytes=_CHUNK,
    )

    storage.promote(staged, "datasets/abc/versions/def/original.csv")
    final = storage.path_for("datasets/abc/versions/def/original.csv")

    assert final.exists()
    assert not staged.path.exists()
    assert final.read_bytes() == b"id\n1\n2\n"


def test_resolve_key_rejects_traversal(tmp_path: Path) -> None:
    storage = LocalFileStorage(tmp_path)
    with pytest.raises(ValueError):
        storage._resolve_key("../escaped.csv")  # type: ignore[attr-defined]
    with pytest.raises(ValueError):
        storage._resolve_key("/abs.csv")  # type: ignore[attr-defined]
    with pytest.raises(ValueError):
        storage._resolve_key("datasets/../../escaped.csv")  # type: ignore[attr-defined]
    with pytest.raises(ValueError):
        storage._resolve_key("datasets/sub/")  # type: ignore[attr-defined]
    with pytest.raises(ValueError):
        storage._resolve_key("")  # type: ignore[attr-defined]


def test_delete_is_idempotent(tmp_path: Path) -> None:
    storage = LocalFileStorage(tmp_path)
    storage.delete("datasets/never/original.csv")
