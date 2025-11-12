"""
Logging utility for the API
VULNERABILITY: This logger logs full Authorization headers including tokens
"""
import logging
import sys
from datetime import datetime
from typing import Any


class TokenLogger:
    """
    Custom logger that logs API requests

    SECURITY ISSUE: Logs full Authorization headers containing access tokens
    This is a common mistake that exposes sensitive tokens in log files
    """

    def __init__(self, name: str = "oauth-lab-api"):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(logging.INFO)

        # Console handler
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(logging.INFO)

        # Format with timestamp
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        handler.setFormatter(formatter)

        if not self.logger.handlers:
            self.logger.addHandler(handler)

    def log_request(self, method: str, path: str, headers: dict, **kwargs):
        """
        Log incoming API request

        VULNERABILITY: Logs the full Authorization header with token
        """
        auth_header = headers.get("authorization", "None")

        # VULNERABLE: Logging the full authorization header including token
        log_msg = f"Request: {method} {path} | Authorization: {auth_header}"

        if kwargs:
            log_msg += f" | Extra: {kwargs}"

        self.logger.info(log_msg)

    def log_response(self, status_code: int, path: str, **kwargs):
        """Log API response"""
        log_msg = f"Response: {status_code} for {path}"

        if kwargs:
            log_msg += f" | Extra: {kwargs}"

        self.logger.info(log_msg)

    def log_error(self, error: Exception, context: str = ""):
        """Log error with context"""
        self.logger.error(f"Error in {context}: {str(error)}", exc_info=True)

    def log_auth_attempt(self, email: str, tenant_id: int, success: bool, token: str = None):
        """
        Log authentication attempts

        VULNERABILITY: Logs tokens in authentication logs
        """
        status = "SUCCESS" if success else "FAILED"

        # VULNERABLE: Logging token information
        if token:
            log_msg = f"Auth {status}: {email} (tenant {tenant_id}) | Token: {token[:50]}..."
        else:
            log_msg = f"Auth {status}: {email} (tenant {tenant_id})"

        self.logger.info(log_msg)

    def info(self, message: str):
        """General info logging"""
        self.logger.info(message)

    def warning(self, message: str):
        """Warning logging"""
        self.logger.warning(message)

    def error(self, message: str):
        """Error logging"""
        self.logger.error(message)


# Global logger instance
logger = TokenLogger()
