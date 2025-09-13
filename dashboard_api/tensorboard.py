import os
import threading
import logging
from typing import Dict, Optional, Callable
import time


# WSGI app cache per run_id
_apps: Dict[str, Callable] = {}
_app_logdirs: Dict[str, str] = {}
# Track TB data ingesters per app so we can stop their background reload loops
_app_ingesters: Dict[str, object] = {}
_lock = threading.Lock()
_log = logging.getLogger("dashboard.tensorboard")

# Heartbeat timestamps per run_id to control lifecycle
_last_ping: Dict[str, float] = {}

# Idle eviction configuration (seconds)
IDLE_TIMEOUT = int(os.environ.get("TB_IDLE_TIMEOUT", "60"))
SWEEP_INTERVAL = int(os.environ.get("TB_SWEEP_INTERVAL", "10"))
_sweeper_started = False
_sweeper_thread: Optional[threading.Thread] = None


def _start_sweeper_if_needed():
    global _sweeper_started, _sweeper_thread
    with _lock:
        if _sweeper_started:
            return
        _sweeper_started = True

        def _sweeper():
            while True:
                try:
                    now = time.time()
                    to_evict: list[str] = []
                    with _lock:
                        for run_id, ts in list(_last_ping.items()):
                            if now - ts > IDLE_TIMEOUT:
                                to_evict.append(run_id)
                        for run_id in to_evict:
                            if run_id in _apps:
                                _log.info(
                                    "Evicting idle TensorBoard app run_id=%s (idle %.1fs)",
                                    run_id,
                                    now - _last_ping.get(run_id, now),
                                )
                                # Best-effort: stop LocalDataIngester's background reload loop
                                ing = _app_ingesters.pop(run_id, None)
                                try:
                                    if ing is not None and hasattr(ing, "_reload_interval"):
                                        # Setting to 0 causes the loop to exit on next tick
                                        setattr(ing, "_reload_interval", 0)
                                except Exception:
                                    _log.debug("Failed to adjust ingester reload interval for %s", run_id)
                                _apps.pop(run_id, None)
                                _app_logdirs.pop(run_id, None)
                            _last_ping.pop(run_id, None)
                except Exception as e:
                    _log.exception("Error in TensorBoard sweeper: %s", e)
                time.sleep(SWEEP_INTERVAL)

        _sweeper_thread = threading.Thread(target=_sweeper, name="tb-sweeper", daemon=True)
        _sweeper_thread.start()


def _build_tb_wsgi_app(logdir: str, path_prefix: str):
    """Create TB WSGI app using TensorBoard's own initialization path.

    Mirrors tensorboard.program.TensorBoard: configure flags, build the data
    provider via ingester, then construct TensorBoardWSGIApp.
    """
    from tensorboard import program
    from tensorboard.backend import application as tb_application

    tb = program.TensorBoard()
    argv = [
        "serve",
        "--logdir",
        os.path.abspath(logdir),
        "--reload_interval",
        "30",
        # Keep everything in-process; no external data server.
        "--load_fast",
        "false",
    ]
    tb.configure(argv=argv)
    _log.debug(
        "Configured TensorBoard: logdir=%s, prefix=%s",
        os.path.abspath(logdir),
        path_prefix,
    )

    data_provider, deprecated_multiplexer = tb._make_data_provider()
    app = tb_application.TensorBoardWSGIApp(
        tb.flags,
        tb.plugin_loaders,
        data_provider,
        tb.assets_zip_provider,
        deprecated_multiplexer,
    )
    # Attach the ingester so callers can control its lifecycle
    try:
        setattr(app, "_tb_ingester", getattr(tb, "_ingester", None))
    except Exception:
        pass
    return app


def get_or_create_tb_app(run_id: str, logdir: str, mount_prefix: str):
    """Return a cached WSGI app for ``run_id`` or create a new one.

    ``mount_prefix`` is the URL path under which this app is mounted, e.g. ``/tb/{run_id}``.
    """
    logdir = os.path.abspath(logdir)
    _start_sweeper_if_needed()
    with _lock:
        existing = _apps.get(run_id)
        if existing and _app_logdirs.get(run_id) == logdir:
            _log.debug("Reusing TB app for run_id=%s logdir=%s", run_id, logdir)
            return existing
        _log.info("Creating TB app for run_id=%s logdir=%s mount=%s", run_id, logdir, mount_prefix)
        app = _build_tb_wsgi_app(logdir, path_prefix=mount_prefix)
        _apps[run_id] = app
        _app_logdirs[run_id] = logdir
        # Stash the data ingester for this app if present
        ing = getattr(app, "_tb_ingester", None)
        if ing is not None:
            _app_ingesters[run_id] = ing
        return app


def record_heartbeat(run_id: str):
    """Record a heartbeat for the given run_id to keep its TB app alive."""
    _start_sweeper_if_needed()
    with _lock:
        _last_ping[run_id] = time.time()
        # No-op if app not yet created; it'll be lazily created on access
        return {"ok": True, "idle_timeout": IDLE_TIMEOUT}


def get_embedded_url_path(run_id: str) -> str:
    """Return the URL path to embed for a given run_id (served by our ASGI mount).

    Includes a trailing slash to play nice with TensorBoard's routing.
    """
    return f"/tb/{run_id}/"


def make_dispatcher(db_session_factory, models_module):
    """Create a WSGI dispatcher that routes /<run_id>/... to a per-run TensorBoard WSGI app.

    The dispatcher expects to be mounted at "/tb" by the ASGI app; it uses the database to
    resolve a run's effective logdir as ``(run.log_dir or 'runs')/run.name``.
    """

    def _resolve_logdir(run_id: str) -> Optional[str]:
        db = db_session_factory()
        try:
            run = db.query(models_module.Run).get(run_id)
            if not run:
                return None
            root = run.log_dir or "runs"
            return os.path.join(root, run.name)
        finally:
            db.close()

    def app(environ, start_response):
        # Path within the /tb mount
        path = environ.get("PATH_INFO", "") or "/"
        _log.debug("/tb PATH_INFO=%s SCRIPT_NAME=%s", path, environ.get("SCRIPT_NAME", ""))
        # Expect /<run_id>/...
        parts = [p for p in path.split("/") if p]
        if not parts:
            # Simple index page
            _log.debug("/tb index")
            start_response("200 OK", [("Content-Type", "text/plain; charset=utf-8")])
            return [b"TensorBoard mount. Use /tb/<run_id>/"]

        run_id = parts[0]
        remainder = "/" + "/".join(parts[1:])

        # If the request was to /tb/<run_id> (no trailing slash), redirect to
        # /tb/<run_id>/ to match TensorBoard's expected routing behavior.
        if len(parts) == 1 and not path.endswith("/"):
            base_mount = environ.get("SCRIPT_NAME", "")
            loc = f"{base_mount}/{run_id}/"
            qs = environ.get("QUERY_STRING")
            if qs:
                loc = f"{loc}?{qs}"
            start_response(
                "308 Permanent Redirect",
                [("Location", loc), ("Content-Type", "text/plain; charset=utf-8")],
            )
            return [f"Redirecting to {loc}".encode("utf-8")]

        # Resolve TensorBoard logdir for this run from DB
        logdir = _resolve_logdir(run_id)
        exists = os.path.isdir(logdir) if logdir else False
        try:
            files = [f for f in os.listdir(logdir)] if exists else []
        except Exception:
            files = []
        _log.debug(
            "Resolved run_id=%s -> logdir=%s exists=%s files=%s",
            run_id,
            logdir,
            exists,
            ", ".join(files[:5]) + (" …" if len(files) > 5 else ""),
        )
        if not logdir or not os.path.isdir(logdir):
            _log.warning("Missing TB logdir for run_id=%s logdir=%s", run_id, logdir)
            start_response("404 Not Found", [("Content-Type", "text/plain; charset=utf-8")])
            return [b"Run not found or no TensorBoard logs present"]

        # Compose nested SCRIPT_NAME as if mounted at /tb/<run_id>
        base_mount = environ.get("SCRIPT_NAME", "")
        mount_prefix = f"{base_mount}/{run_id}"
        # Keep app warm on access
        tb_app = get_or_create_tb_app(run_id, logdir, mount_prefix)
        # Do NOT treat generic TB HTTP traffic as activity. Rely solely on
        # explicit heartbeats from the UI to decide liveness so background
        # polling inside TensorBoard doesn't indefinitely keep apps alive.

        # Adjust environ for inner TB app: set SCRIPT_NAME to /tb/<run_id>
        # and pass only the remainder in PATH_INFO
        script_name = mount_prefix
        inner_environ = dict(environ)
        inner_environ["SCRIPT_NAME"] = script_name
        # Serve root for initial load; TB handles client-side routing
        if remainder in ("", "/"):
            inner_environ["PATH_INFO"] = "/"
        else:
            inner_environ["PATH_INFO"] = remainder
        _log.debug("Dispatch TB: SCRIPT_NAME=%s PATH_INFO=%s", inner_environ["SCRIPT_NAME"], inner_environ["PATH_INFO"])

        # Wrap start_response to log 5xx statuses for easier debugging
        def _sr(status, headers, exc_info=None):
            try:
                code = int(status.split(" ")[0])
            except Exception:
                code = 0
            if code >= 500:
                _log.error("TB responded %s for %s%s", status, inner_environ.get("SCRIPT_NAME", ""), inner_environ.get("PATH_INFO", ""))
            return start_response(status, headers, exc_info)

        return tb_app(inner_environ, _sr)

    return app
