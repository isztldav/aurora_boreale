import uvicorn
import logging
import os

if __name__ == "__main__":
    # Allow DEBUG via env var (DASHBOARD_DEBUG=1)
    level = logging.DEBUG if os.getenv("DASHBOARD_DEBUG") else logging.INFO
    logging.basicConfig(level=level, format="%(levelname)s %(name)s: %(message)s")
    uvicorn.run(
        "dashboard_api.app:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="debug" if level == logging.DEBUG else "info",
        access_log=True,
    )
