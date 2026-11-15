from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response

from app.api.admins import require_admin
from app.schemas.dify_call_logs import (
    DifyCallLogDetail,
    DifyCallLogFilterOptions,
    DifyCallLogList,
    DifyCallLogQuery,
)

router = APIRouter(
    prefix="/api/v1/admin/dify/call-logs",
    tags=["dify-call-logs"],
    dependencies=[Depends(require_admin)],
)


@router.get("", response_model=DifyCallLogList)
def list_call_logs(
    request: Request,
    response: Response,
    query: Annotated[DifyCallLogQuery, Query()],
):
    response.headers["Cache-Control"] = "no-store"
    result = request.app.state.dify_call_log_repository.list(
        page=query.page,
        page_size=query.page_size,
        filters=query.model_dump(exclude={"page", "page_size"}, exclude_none=True),
    )
    result["items"] = [
        request.app.state.cny_converter.enrich(item) for item in result["items"]
    ]
    return result


@router.get("/filter-options", response_model=DifyCallLogFilterOptions)
def call_log_filter_options(request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return request.app.state.dify_call_log_repository.filter_options()


@router.get("/{call_id}", response_model=DifyCallLogDetail)
def call_log_detail(call_id: UUID, request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return request.app.state.cny_converter.enrich(
        request.app.state.dify_call_log_repository.get(str(call_id))
    )
