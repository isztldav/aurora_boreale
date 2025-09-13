from fastapi import APIRouter

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login():
    # Stub for MVP; real auth to be added later
    return {"message": "login not implemented; using open access for MVP"}


@router.post("/logout")
def logout():
    return {"message": "ok"}


@router.get("/me")
def me():
    return {"user": {"email": "demo@example.com", "role": "admin"}}

