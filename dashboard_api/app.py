from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.responses import HTMLResponse, RedirectResponse

from .db import init_db
from .routers import projects, groups, configs, runs, agents, auth, datasets, registry_models, augmentations


def create_app() -> FastAPI:
    app = FastAPI(title="Unified Training Dashboard (MVP)", version="0.1.0")

    # Init DB
    init_db()

    # Routers
    app.include_router(auth.router, prefix="/api/v1")
    app.include_router(projects.router, prefix="/api/v1")
    app.include_router(groups.router, prefix="/api/v1")
    app.include_router(configs.router, prefix="/api/v1")
    app.include_router(runs.router, prefix="/api/v1")
    app.include_router(agents.router, prefix="/api/v1")
    app.include_router(datasets.router, prefix="/api/v1")
    app.include_router(registry_models.router, prefix="/api/v1")
    app.include_router(augmentations.router, prefix="/api/v1")

    # Static and templates for a minimal web UI
    app.mount("/static", StaticFiles(directory="dashboard_api/static"), name="static")
    templates = Jinja2Templates(directory="dashboard_api/templates")

    @app.get("/", response_class=HTMLResponse)
    async def index(request: Request):
        return RedirectResponse("/web/projects")

    # Simple pages
    @app.get("/web/login", response_class=HTMLResponse)
    async def web_login(request: Request):
        return templates.TemplateResponse("login.html", {"request": request})

    @app.get("/web/projects", response_class=HTMLResponse)
    async def web_projects(request: Request):
        return templates.TemplateResponse("projects.html", {"request": request})

    @app.get("/web/projects/{project_id}", response_class=HTMLResponse)
    async def web_project_overview(project_id: str, request: Request):
        return templates.TemplateResponse("project_overview.html", {"request": request, "project_id": project_id})

    @app.get("/web/projects/{project_id}/configs", response_class=HTMLResponse)
    async def web_project_configs(project_id: str, request: Request):
        return templates.TemplateResponse("project_configs.html", {"request": request, "project_id": project_id})

    @app.get("/web/projects/{project_id}/runs", response_class=HTMLResponse)
    async def web_project_runs(project_id: str, request: Request):
        return templates.TemplateResponse("project_runs.html", {"request": request, "project_id": project_id})

    @app.get("/web/projects/{project_id}/datasets", response_class=HTMLResponse)
    async def web_project_datasets(project_id: str, request: Request):
        return templates.TemplateResponse("project_datasets.html", {"request": request, "project_id": project_id})

    @app.get("/web/projects/{project_id}/models", response_class=HTMLResponse)
    async def web_project_models(project_id: str, request: Request):
        return templates.TemplateResponse("project_models.html", {"request": request, "project_id": project_id})

    @app.get("/web/projects/{project_id}/augmentations", response_class=HTMLResponse)
    async def web_project_augmentations(project_id: str, request: Request):
        return templates.TemplateResponse("project_augmentations.html", {"request": request, "project_id": project_id})

    @app.get("/web/runs/{run_id}", response_class=HTMLResponse)
    async def web_run_detail(run_id: str, request: Request):
        return templates.TemplateResponse("run_detail.html", {"request": request, "run_id": run_id})

    @app.get("/web/agents", response_class=HTMLResponse)
    async def web_agents(request: Request):
        return templates.TemplateResponse("agents.html", {"request": request})

    return app


app = create_app()
