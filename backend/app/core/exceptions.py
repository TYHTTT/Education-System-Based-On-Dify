from __future__ import annotations


class AppError(Exception):
    status_code = 500
    code = "internal_error"
    public_message = "服务器暂时无法处理请求"

    def __init__(
        self, message: str | None = None, *, internal_message: str | None = None
    ) -> None:
        super().__init__(internal_message or message or self.public_message)
        self.message = message or self.public_message
        self.internal_message = internal_message or self.message


class ConfigurationError(AppError):
    status_code = 503
    code = "service_not_configured"
    public_message = "服务尚未完成配置"


class LLMServiceError(AppError):
    status_code = 502
    code = "LLM_SERVICE_UNAVAILABLE"
    public_message = "大模型服务暂时不可用，请稍后重试"


class CallLogUnavailableError(AppError):
    status_code = 503
    code = "CALL_LOG_UNAVAILABLE"
    public_message = "调用记录服务暂时不可用，请稍后重试"


class CallLogNotFoundError(AppError):
    status_code = 404
    code = "DIFY_CALL_LOG_NOT_FOUND"
    public_message = "调用记录不存在"


class DifyCredentialDisabledError(AppError):
    status_code = 403
    code = "DIFY_CREDENTIAL_DISABLED"
    public_message = "当前 AI 服务已停用，请联系管理员"


class DifyCredentialNotFoundError(AppError):
    status_code = 404
    code = "DIFY_CREDENTIAL_NOT_FOUND"
    public_message = "Dify 凭据不存在"


class StudentNotFoundError(AppError):
    status_code = 404
    code = "STUDENT_NOT_FOUND"
    public_message = "登录已失效，请重新登录"


class AdminUnauthorizedError(AppError):
    status_code = 401
    code = "ADMIN_UNAUTHORIZED"
    public_message = "管理员登录已失效，请重新登录"


class TopicNotFoundError(AppError):
    status_code = 404
    code = "TOPIC_NOT_FOUND"
    public_message = "未找到该课程知识点"


class CourseTopicMismatchError(AppError):
    status_code = 422
    code = "COURSE_TOPIC_MISMATCH"
    public_message = "知识点不属于当前课程"


class CourseNotFoundError(AppError):
    status_code = 404
    code = "COURSE_NOT_FOUND"
    public_message = "课程不存在或已停用"


class CourseConflictError(AppError):
    status_code = 409
    code = "COURSE_ID_CONFLICT"
    public_message = "课程创建冲突，请重试"
