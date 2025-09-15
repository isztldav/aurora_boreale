from fastapi import FastAPI
from starlette.responses import RedirectResponse, JSONResponse
from starlette.middleware.wsgi import WSGIMiddleware
from fastapi.middleware.cors import CORSMiddleware

from .db import init_db
from .routers import projects, groups, configs, runs, agents, auth, datasets, registry_models, augmentations, registry
from .db import SessionLocal
from . import models


def create_app() -> FastAPI:
    app = FastAPI(title="Unified Training Dashboard (MVP)", version="0.1.0")

    # Init DB
    init_db()

    # CORS for external UI (e.g. Next.js on localhost:3000)
    # Allow configuration via env var DASHBOARD_CORS_ORIGINS (comma-separated)
    import os
    origins_raw = os.environ.get("DASHBOARD_CORS_ORIGINS")
    if origins_raw:
        origins = [o.strip() for o in origins_raw.split(",") if o.strip()]
    else:
        origins = [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routers
    app.include_router(auth.router, prefix="/api/v1")
    app.include_router(projects.router, prefix="/api/v1")
    app.include_router(groups.router, prefix="/api/v1")
    app.include_router(configs.router, prefix="/api/v1")
    app.include_router(runs.router, prefix="/api/v1")
    app.include_router(agents.router, prefix="/api/v1")
    app.include_router(datasets.router, prefix="/api/v1")
    app.include_router(datasets.browse_router, prefix="/api/v1")
    app.include_router(registry_models.router, prefix="/api/v1")
    app.include_router(augmentations.router, prefix="/api/v1")
    app.include_router(registry.router, prefix="/api/v1")
    from .routers import tensorboard as tb_router
    app.include_router(tb_router.router, prefix="/api/v1")
    # WebSocket endpoint for live updates
    from .routers import ws as ws_router
    app.include_router(ws_router.router, prefix="/api/v1")

    # Mount TensorBoard as a WSGI app under /tb
    from .tensorboard import make_dispatcher
    dispatcher = make_dispatcher(SessionLocal, models)
    app.mount("/tb", WSGIMiddleware(dispatcher))

    @app.get("/")
    async def index():
      # Point users to interactive docs by default
      return RedirectResponse("/docs")

    return app


app = create_app()
