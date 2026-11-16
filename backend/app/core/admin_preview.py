import uuid

ADMIN_PREVIEW_PREFIX = "admin-preview:"


def admin_preview_student_id(admin_id: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"ml-coach:admin-preview:{admin_id}"))
