from fastapi import APIRouter, Depends, Request

from app.api.admins import require_admin
from app.schemas.dify_settings import DifySettingsResponse, DifySettingsWrite

router = APIRouter(prefix="/api/v1/admin/settings", tags=["admin-settings"], dependencies=[Depends(require_admin)])


@router.get("/free-qa", response_model=DifySettingsResponse)
def free_qa_settings(request: Request):
    return request.app.state.dify_settings_repository.public_free_qa()


@router.put("/free-qa", response_model=DifySettingsResponse)
def save_free_qa_settings(payload: DifySettingsWrite, request: Request):
    return request.app.state.dify_settings_repository.save_free_qa(payload.model_dump())
