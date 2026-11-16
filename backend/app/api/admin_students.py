from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.admins import require_admin
from app.api.students import learning_repository_from_request
from app.schemas.student import StudentAccountListResponse
from app.services.learning_repository import LearningRepository

router = APIRouter(
    prefix="/api/v1/admin/students",
    tags=["student-management"],
    dependencies=[Depends(require_admin)],
)


@router.get("", response_model=StudentAccountListResponse)
def list_students(
    q: str = Query(default="", max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    repository: LearningRepository = Depends(learning_repository_from_request),
):
    return repository.list_students(query=q, page=page, page_size=page_size)


@router.delete("/{student_id}", status_code=204)
def delete_student(
    student_id: UUID,
    repository: LearningRepository = Depends(learning_repository_from_request),
):
    if not repository.delete_student(str(student_id)):
        raise HTTPException(status_code=404, detail="学生账号不存在或已删除")
