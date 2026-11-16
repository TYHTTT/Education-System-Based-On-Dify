from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from psycopg.errors import UniqueViolation

from app.api.admins import require_admin
from app.api.dependencies import learning_repository_from_request
from app.schemas.student import (
    AuthenticatedStudentResponse,
    CurrentStudentResponse,
    LoginRequest,
    RegisterStudentRequest,
)
from app.schemas.account import (
    ChangeAccountPasswordRequest,
    UpdateAccountProfileRequest,
)
from app.core.admin_preview import ADMIN_PREVIEW_PREFIX

router = APIRouter(prefix="/api/v1/students", tags=["students"])


def _bearer_token(authorization: str) -> str:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="无效的登录凭据")
    return token


def _auth_response(student: dict) -> AuthenticatedStudentResponse:
    return AuthenticatedStudentResponse(
        student_id=student["id"],
        username=student["username"],
        display_name=student["display_name"],
        access_token=student["access_token"],
        created_at=student["created_at"],
    )


@router.post(
    "/register",
    response_model=AuthenticatedStudentResponse,
    status_code=201,
    summary="管理员分配学生账号",
    dependencies=[Depends(require_admin)],
)
def register_student(
    payload: RegisterStudentRequest, request: Request
) -> AuthenticatedStudentResponse:
    try:
        return _auth_response(
            learning_repository_from_request(request).register_student(
                **payload.model_dump()
            )
        )
    except ValueError as exc:
        if str(exc) == "username_taken":
            raise HTTPException(status_code=409, detail="用户名已被使用") from exc
        raise


@router.post("/login", response_model=AuthenticatedStudentResponse)
def login_student(
    payload: LoginRequest, request: Request
) -> AuthenticatedStudentResponse:
    student = learning_repository_from_request(request).authenticate_student(
        **payload.model_dump()
    )
    if student is None:
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    return _auth_response(student)


@router.get("/me", response_model=CurrentStudentResponse)
def current_student(
    request: Request, authorization: str = Header(..., alias="Authorization")
) -> CurrentStudentResponse:
    student = learning_repository_from_request(request).student_from_token(
        _bearer_token(authorization)
    )
    return CurrentStudentResponse(
        student_id=student["id"],
        username=student["username"],
        display_name=student["display_name"],
        created_at=student["created_at"],
    )


@router.post("/logout", status_code=204)
def logout_student(
    request: Request, authorization: str = Header(..., alias="Authorization")
) -> None:
    learning_repository_from_request(request).revoke_session(
        _bearer_token(authorization)
    )


def _editable_student_token(authorization: str) -> str:
    token = _bearer_token(authorization)
    if token.startswith(ADMIN_PREVIEW_PREFIX):
        raise HTTPException(
            status_code=403, detail="管理员预览模式下请前往管理员账号信息页面修改资料"
        )
    return token


@router.patch("/me", response_model=CurrentStudentResponse)
def update_current_student(
    payload: UpdateAccountProfileRequest,
    request: Request,
    authorization: str = Header(..., alias="Authorization"),
):
    token = _editable_student_token(authorization)
    try:
        student = learning_repository_from_request(request).update_student_profile(
            token=token, **payload.model_dump()
        )
    except UniqueViolation:
        raise HTTPException(status_code=409, detail="用户名已被使用") from None
    return CurrentStudentResponse(
        student_id=student["id"],
        **{key: student[key] for key in ("username", "display_name", "created_at")},
    )


@router.put("/me/password", status_code=204)
def change_current_student_password(
    payload: ChangeAccountPasswordRequest,
    request: Request,
    authorization: str = Header(..., alias="Authorization"),
):
    token = _editable_student_token(authorization)
    if not learning_repository_from_request(request).change_student_password(
        token=token,
        current_password=payload.current_password.get_secret_value(),
        new_password=payload.new_password.get_secret_value(),
    ):
        raise HTTPException(status_code=403, detail="当前密码不正确")
