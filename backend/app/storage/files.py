"""Safe file-storage abstraction and local filesystem implementation."""

import hashlib
import os
import tempfile
from pathlib import Path, PurePosixPath
from typing import BinaryIO, Protocol

from app.ingestion.exceptions import EmptyUploadError, UploadTooLargeError
from app.ingestion.types import StagedUpload


class FileStorage(Protocol):
    """Operations required by ingestion and downstream readers.

    The read-only ``path_for`` helper lets services like profiling
    inspect the original file without exposing the storage root.
    """

    def stage(
        self,
        stream: BinaryIO,
        *,
        original_filename: str,
        media_type: str | None,
        max_size_bytes: int,
        chunk_size_bytes: int,
    ) -> StagedUpload: ...

    def promote(self, staged: StagedUpload, storage_key: str) -> None: ...

    def discard_stage(self, staged: StagedUpload) -> None: ...

    def delete(self, storage_key: str) -> None: ...

    def path_for(self, storage_key: str) -> Path: ...


class LocalFileStorage:
    """Store originals under generated keys and atomically promote staged uploads."""

    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.staging_root = self.root / ".staging"
        self.staging_root.mkdir(parents=True, exist_ok=True)

    def stage(
        self,
        stream: BinaryIO,
        *,
        original_filename: str,
        media_type: str | None,
        max_size_bytes: int,
        chunk_size_bytes: int,
    ) -> StagedUpload:
        digest = hashlib.sha256()
        size_bytes = 0
        temporary_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="wb",
                dir=self.staging_root,
                prefix="upload-",
                suffix=".tmp",
                delete=False,
            ) as destination:
                temporary_path = Path(destination.name)
                while chunk := stream.read(chunk_size_bytes):
                    size_bytes += len(chunk)
                    if size_bytes > max_size_bytes:
                        raise UploadTooLargeError(max_size_bytes)
                    digest.update(chunk)
                    destination.write(chunk)
                destination.flush()
                os.fsync(destination.fileno())

            if size_bytes == 0:
                raise EmptyUploadError
            return StagedUpload(
                path=temporary_path,
                original_filename=original_filename,
                size_bytes=size_bytes,
                content_sha256=digest.hexdigest(),
                media_type=media_type,
            )
        except Exception:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)
            raise

    def promote(self, staged: StagedUpload, storage_key: str) -> None:
        destination = self._resolve_key(storage_key)
        destination.parent.mkdir(parents=True, exist_ok=True)
        os.replace(staged.path, destination)

    def discard_stage(self, staged: StagedUpload) -> None:
        staged.path.unlink(missing_ok=True)

    def delete(self, storage_key: str) -> None:
        self._resolve_key(storage_key).unlink(missing_ok=True)

    def path_for(self, storage_key: str) -> Path:
        """Resolve an internal key for processing/tests without exposing it through the API."""

        return self._resolve_key(storage_key)

    def _resolve_key(self, storage_key: str) -> Path:
        key = PurePosixPath(storage_key)
        if (
            not storage_key
            or key.is_absolute()
            or not key.parts
            or any(part in {"", ".", ".."} for part in key.parts)
            or storage_key != storage_key.strip()
            or storage_key.endswith("/")
            or storage_key.endswith("\\")
        ):
            raise ValueError("storage_key must be a safe relative POSIX path")
        destination = self.root.joinpath(*key.parts).resolve()
        try:
            destination.relative_to(self.root)
        except ValueError as exc:
            raise ValueError("storage_key resolves outside the storage root") from exc
        return destination
