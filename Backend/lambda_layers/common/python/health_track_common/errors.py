"""Application error classes."""


class AppError(Exception):
    """Base application error with HTTP status code."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message

    def __repr__(self) -> str:
        return f"AppError(status_code={self.status_code}, message={self.message!r})"
