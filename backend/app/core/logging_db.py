from sqlalchemy.orm import Session
from app.db import models
import traceback

def log_error_to_db(db: Session, message: str, exception: Exception | None = None, detail: str | None = None):
    """
    Utility function to log an error/exception in the database system_logs table.
    """
    try:
        err_detail = detail or ""
        if exception:
            err_detail += f"\nException: {str(exception)}\nTraceback:\n" + "".join(
                traceback.format_exception(type(exception), exception, exception.__traceback__)
            )
            
        system_log = models.SystemLog(
            level="error",
            message=message,
            detail=err_detail
        )
        db.add(system_log)
        db.commit()
    except Exception as log_ex:
        # Fallback to stdout to prevent log recursion crashing
        print(f"FAILED TO WRITE LOG TO DB: {log_ex}")
