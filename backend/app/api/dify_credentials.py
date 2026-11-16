from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response

from app.api.admins import require_admin
from app.schemas.dify_credentials import (
    DifyCredentialList,
    DifyCredentialQuery,
    DifyCredentialStatus,
    DifyCredentialUpdate,
)

router = APIRouter(
    prefix="/api/v1/admin/dify/credentials",
    tags=["dify-credentials"],
    dependencies=[Depends(require_admin)],
)


@router.get("", response_model=DifyCredentialList)
def list_credentials(
    request: Request,
    response: Response,
    query: Annotated[DifyCredentialQuery, Query()],
):
    response.headers["Cache-Control"] = "no-store"
    result = request.app.state.dify_credential_management_repository.list(
        page=query.page, page_size=query.page_size
    )
    for item in result["items"]:
        item["currencies"] = [
            request.app.state.cny_converter.enrich(currency)
            for currency in item["currencies"]
        ]
    return result


@router.patch("/{credential_id}", response_model=DifyCredentialStatus)
def update_credential(
    credential_id: UUID,
    body: DifyCredentialUpdate,
    request: Request,
    response: Response,
):
    response.headers["Cache-Control"] = "no-store"
    return request.app.state.dify_credential_management_repository.set_enabled(
        str(credential_id), body.enabled
    )
