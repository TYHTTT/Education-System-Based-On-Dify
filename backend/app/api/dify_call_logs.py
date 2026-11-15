from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response

from app.api.admins import require_admin
from app.schemas.dify_call_logs import DifyCallLogDetail, DifyCallLogList

router = APIRouter(
    prefix="/api/v1/admin/dify/call-logs",
    tags=["dify-call-logs"],
    dependencies=[Depends(require_admin)],
)


@router.get("", response_model=DifyCallLogList)
def list_call_logs(
    request: Request,
    response: Response,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
):
    response.headers["Cache-Control"] = "no-store"
    result = request.app.state.dify_call_log_repository.list(
        page=page, page_size=page_size
    )
    result["items"] = [
        request.app.state.cny_converter.enrich(item) for item in result["items"]
    ]
    return result


@router.get("/{call_id}", response_model=DifyCallLogDetail)
def call_log_detail(call_id: UUID, request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return request.app.state.cny_converter.enrich(
        request.app.state.dify_call_log_repository.get(str(call_id))
    )
